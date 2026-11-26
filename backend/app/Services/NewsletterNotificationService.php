<?php

namespace App\Services;

use App\Models\NewsletterNotification as Delivery;
use App\Models\NewsletterSubscriber;
use App\Services\Newsletter\Contracts\NotificationCategory;
use App\Services\Newsletter\NotificationCategoryRegistry;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Delivers a newsletter notification (any category) to eligible subscribers.
 *
 * Eligible = active (verified, enabled, not unsubscribed) and opted in to the category.
 *
 * Duplicate protection: one newsletter_notifications row per (category, item,
 * subscriber), enforced by a unique key, and claimed atomically before sending.
 * In "pending" mode a subscriber whose row is already `sent` is skipped; in
 * "all" mode (manual resend) the same row is reused and its send_count
 * incremented, so no extra delivery rows are ever created.
 */
class NewsletterNotificationService
{
    public const MODE_PENDING = 'pending'; // not yet notified + previously failed
    public const MODE_ALL = 'all';         // manual resend to every eligible subscriber

    public const TRIGGER_AUTO = 'auto';
    public const TRIGGER_MANUAL = 'manual';

    /** A `sending` claim older than this is treated as abandoned (e.g. crashed request). */
    private const STALE_SENDING_MINUTES = 15;

    public function __construct(
        private readonly EmailService $emailService,
        private readonly NewsletterService $newsletterService,
        private readonly NotificationCategoryRegistry $categories,
    ) {
    }

    public function eligibleSubscribers(NotificationCategory $category): Builder
    {
        return NewsletterSubscriber::query()->eligibleFor($category);
    }

    /**
     * @return array{sent:int, failed:int, skipped:int, eligible:int, reason:?string}
     */
    public function send(NotificationCategory|string $category, int $referenceId, string $mode = self::MODE_PENDING, string $trigger = self::TRIGGER_AUTO): array
    {
        $category = is_string($category) ? $this->categories->get($category) : $category;
        $summary = ['sent' => 0, 'failed' => 0, 'skipped' => 0, 'eligible' => 0, 'reason' => null];

        // Always re-read: the caller's copy may be stale (e.g. unpublished after dispatch).
        $subject = $category->find($referenceId);

        $summary['reason'] = match (true) {
            $subject === null => 'The record no longer exists.',
            ! $category->enabled() => $category->label().' notification emails are disabled.',
            default => $category->blockReason($subject),
        };

        if ($summary['reason'] !== null) {
            return $summary;
        }

        $payload = $category->payload($subject);
        $mode = $mode === self::MODE_ALL ? self::MODE_ALL : self::MODE_PENDING;
        $trigger = $trigger === self::TRIGGER_MANUAL ? self::TRIGGER_MANUAL : self::TRIGGER_AUTO;

        $this->eligibleSubscribers($category)
            ->chunkById(200, function ($subscribers) use ($category, $referenceId, $payload, $mode, $trigger, &$summary) {
                foreach ($subscribers as $subscriber) {
                    $summary['eligible']++;
                    $summary[$this->deliver($category, $referenceId, $subscriber, $payload, $mode, $trigger)]++;
                }
            });

        Log::info('Newsletter notification run finished', [
            'category' => $category->key(),
            'reference_id' => $referenceId,
            'mode' => $mode,
            'trigger' => $trigger,
        ] + $summary);

        return $summary;
    }

    /** @return 'sent'|'failed'|'skipped' */
    private function deliver(NotificationCategory $category, int $referenceId, NewsletterSubscriber $subscriber, array $payload, string $mode, string $trigger): string
    {
        $context = ['category' => $category->key(), 'reference_id' => $referenceId, 'subscriber_id' => $subscriber->id];

        try {
            $delivery = $this->deliveryRecord($category->key(), $referenceId, $subscriber->id);

            if (! $this->claim($delivery, $mode)) {
                return 'skipped';
            }

            $sent = $this->emailService->send(
                $subscriber->email,
                $category->mailable(),
                $category->mailData($payload, $this->newsletterService->unsubscribeUrl($subscriber)),
                true
            );

            $delivery->refresh();
            $delivery->forceFill([
                // A failed resend never downgrades an earlier successful delivery.
                'status' => ($sent || $delivery->sent_at) ? Delivery::STATUS_SENT : Delivery::STATUS_FAILED,
                'attempts' => $delivery->attempts + 1,
                'send_count' => $delivery->send_count + ($sent ? 1 : 0),
                'last_trigger' => $trigger,
                'sent_at' => $sent ? now() : $delivery->sent_at,
                'last_error' => $sent ? null : 'Email sending failed; see application log.',
            ])->save();

            if (! $sent) {
                Log::warning('Newsletter notification failed', $context);
            }

            return $sent ? 'sent' : 'failed';
        } catch (Throwable $e) {
            Log::error('Newsletter notification error', $context + ['error' => $e->getMessage()]);

            Delivery::forItem($category->key(), $referenceId)
                ->where('newsletter_subscriber_id', $subscriber->id)
                ->where('status', Delivery::STATUS_SENDING)
                ->update([
                    'status' => Delivery::STATUS_FAILED,
                    'attempts' => DB::raw('attempts + 1'),
                    'last_error' => Str::limit($e->getMessage(), 250, ''),
                    'updated_at' => now(),
                ]);

            return 'failed';
        }
    }

    private function deliveryRecord(string $category, int $referenceId, int $subscriberId): Delivery
    {
        $keys = ['category' => $category, 'reference_id' => $referenceId, 'newsletter_subscriber_id' => $subscriberId];

        try {
            return Delivery::firstOrCreate($keys, ['status' => Delivery::STATUS_PENDING]);
        } catch (QueryException $e) {
            // A concurrent run inserted the same row first; the unique key held.
            if (in_array($e->errorInfo[0] ?? null, ['23000', '23505'], true)) { // unique violation (MySQL / PostgreSQL)
                return Delivery::where($keys)->firstOrFail();
            }
            throw $e;
        }
    }

    /** Atomically mark the row `sending`; returns false if this subscriber must be skipped. */
    private function claim(Delivery $delivery, string $mode): bool
    {
        $claimable = $mode === self::MODE_ALL
            ? [Delivery::STATUS_PENDING, Delivery::STATUS_FAILED, Delivery::STATUS_SENT]
            : [Delivery::STATUS_PENDING, Delivery::STATUS_FAILED];

        return Delivery::whereKey($delivery->id)
            ->where(function ($query) use ($claimable) {
                $query->whereIn('status', $claimable)
                    ->orWhere(function ($stale) {
                        $stale->where('status', Delivery::STATUS_SENDING)
                            ->where('last_attempt_at', '<', now()->subMinutes(self::STALE_SENDING_MINUTES));
                    });
            })
            ->update([
                'status' => Delivery::STATUS_SENDING,
                'last_attempt_at' => now(),
                'updated_at' => now(),
            ]) === 1;
    }
}
