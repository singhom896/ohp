<?php

namespace App\Services;

use App\Mail\NewsletterSubscribedMail;
use App\Mail\NewsletterVerificationMail;
use App\Models\NewsletterSubscriber;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Newsletter subscription workflow: subscribe -> email verification -> active,
 * and signed-link unsubscribe. All outgoing mail goes through EmailService.
 */
class NewsletterService
{
    public const TOKEN_TTL_HOURS = 48;
    public const RESEND_COOLDOWN_SECONDS = 120;

    public function __construct(private readonly EmailService $emailService)
    {
    }

    /**
     * @return array{success: bool, message: string}
     */
    public function subscribe(string $email, Request $request): array
    {
        $email = Str::lower(trim($email));

        $subscriber = NewsletterSubscriber::where('email', $email)->first();

        if ($subscriber) {
            if ($subscriber->is_verified && ! $subscriber->unsubscribed_at) {
                // Covers active and admin-deactivated subscribers.
                return $this->result(false, 'This email address is already subscribed to our newsletter.');
            }

            if (! $subscriber->unsubscribed_at
                && $subscriber->verification_sent_at
                && $subscriber->verification_sent_at->gt(now()->subSeconds(self::RESEND_COOLDOWN_SECONDS))) {
                return $this->result(false, 'A confirmation email was sent recently. Please check your inbox (and spam folder) to confirm your subscription.');
            }
        } else {
            try {
                $subscriber = NewsletterSubscriber::create([
                    'email' => $email,
                    'is_verified' => false,
                    'status' => NewsletterSubscriber::STATUS_INACTIVE,
                    'ip_address' => $request->ip(),
                    'user_agent' => Str::limit((string) $request->userAgent(), 250, ''),
                ]);
            } catch (QueryException $e) {
                // Unique constraint hit by a concurrent request.
                if (in_array($e->errorInfo[0] ?? null, ['23000', '23505'], true)) { // unique violation (MySQL / PostgreSQL)
                    return $this->result(false, 'This email address is already subscribed to our newsletter.');
                }
                throw $e;
            }
        }

        $plainToken = $this->issueToken($subscriber, $request);

        $sent = $this->emailService->send(
            $subscriber->email,
            NewsletterVerificationMail::class,
            [$this->frontendUrl('/newsletter/verify?token='.$plainToken), self::TOKEN_TTL_HOURS],
            (bool) config('mail_notifications.newsletter_verification', true)
        );

        if (! $sent) {
            // Allow an immediate retry because the email never left.
            $subscriber->forceFill(['verification_sent_at' => null])->save();

            return $this->result(false, 'We could not send the confirmation email right now. Please try again later.');
        }

        return $this->result(true, 'Thank you! Please check your inbox and click the confirmation link to complete your subscription.');
    }

    /**
     * @return array{success: bool, message: string}
     */
    public function verify(string $plainToken): array
    {
        if (! preg_match('/^[A-Za-z0-9]{64}$/', $plainToken)) {
            return $this->result(false, 'This confirmation link is invalid.');
        }

        $subscriber = NewsletterSubscriber::where('verification_token', hash('sha256', $plainToken))->first();

        if (! $subscriber) {
            return $this->result(false, 'This confirmation link is invalid or has already been used.');
        }

        if (! $subscriber->verification_sent_at
            || $subscriber->verification_sent_at->lt(now()->subHours(self::TOKEN_TTL_HOURS))) {
            return $this->result(false, 'This confirmation link has expired. Please subscribe again to receive a new link.');
        }

        DB::transaction(function () use ($subscriber) {
            $subscriber->forceFill([
                'verification_token' => null,
                'is_verified' => true,
                'verified_at' => now(),
                'status' => NewsletterSubscriber::STATUS_ACTIVE,
                'subscribed_at' => now(),
                'unsubscribed_at' => null,
            ])->save();
        });

        $this->emailService->send(
            $subscriber->email,
            NewsletterSubscribedMail::class,
            [$subscriber->email, $this->unsubscribeUrl($subscriber)],
            (bool) config('mail_notifications.newsletter_confirmation', true)
        );

        return $this->result(true, 'Your email address has been confirmed. You are now subscribed to Opportunity Hub updates.');
    }

    /**
     * @return array{success: bool, message: string}
     */
    public function unsubscribe(NewsletterSubscriber $subscriber): array
    {
        if ($subscriber->unsubscribed_at) {
            return $this->result(true, 'You have already been unsubscribed from our newsletter.');
        }

        $subscriber->forceFill([
            'status' => NewsletterSubscriber::STATUS_INACTIVE,
            'unsubscribed_at' => now(),
            'verification_token' => null,
        ])->save();

        return $this->result(true, 'You have been unsubscribed. You will no longer receive newsletter emails from us.');
    }

    /**
     * Permanent signed link (tamper-proof, no expiry) to include in every newsletter email.
     */
    public function unsubscribeUrl(NewsletterSubscriber $subscriber): string
    {
        return $this->frontendUrl('/newsletter/unsubscribe?'.http_build_query(['id' => $subscriber->id, 'token' => $this->unsubscribeToken($subscriber)]));
    }

    /** Unsubscribe link token: HMAC of the subscriber id with the app key (no expiry, cannot be guessed). */
    public function unsubscribeToken(NewsletterSubscriber $subscriber): string
    {
        return hash_hmac('sha256', 'newsletter-unsubscribe|'.$subscriber->id.'|'.$subscriber->email, (string) config('app.key'));
    }

    /** The subscriber an unsubscribe link (id + token) belongs to, or null when the link is invalid. */
    public function subscriberForUnsubscribe(int $id, string $token): ?NewsletterSubscriber
    {
        $subscriber = NewsletterSubscriber::find($id);

        return $subscriber && hash_equals($this->unsubscribeToken($subscriber), $token) ? $subscriber : null;
    }

    /** Absolute address on the Next.js website (config app.frontend_url). */
    private function frontendUrl(string $path): string
    {
        return rtrim((string) config('app.frontend_url'), '/').$path;
    }

    /** Store only the SHA-256 hash; return the plain token for the email link. */
    private function issueToken(NewsletterSubscriber $subscriber, Request $request): string
    {
        $plainToken = Str::random(64);

        $subscriber->forceFill([
            'verification_token' => hash('sha256', $plainToken),
            'verification_sent_at' => now(),
            'ip_address' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 250, ''),
        ])->save();

        return $plainToken;
    }

    private function result(bool $success, string $message): array
    {
        return ['success' => $success, 'message' => $message];
    }
}
