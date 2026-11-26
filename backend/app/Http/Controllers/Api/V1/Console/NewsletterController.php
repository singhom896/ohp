<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\NewsletterNotification as Delivery;
use App\Models\NewsletterSubscriber;
use App\Services\Newsletter\Categories\UpcomingEventsCategory;
use App\Services\NewsletterNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * CMS Management -> Newsletter (admin console).
 *
 *   GET    /newsletter                         subscribers (search, state, page) + counts
 *   GET    /newsletter/export                  all matching subscribers (the page builds the CSV)
 *   PATCH  /newsletter/{id}/status             { status: 0|1 } verified subscribers only
 *   DELETE /newsletter/{id}
 *   GET    /newsletter/events                  published events with delivery stats
 *   GET    /newsletter/events/{id}/history     deliveries of one event
 *   POST   /newsletter/events/{id}/send        { mode: pending|all } send "Upcoming Event" emails now
 */
class NewsletterController extends Controller
{
    use ApiResponse;

    public function __construct(
        private readonly UpcomingEventsCategory $category,
        private readonly NewsletterNotificationService $notifications,
    ) {}

    public function index(Request $request): JsonResponse
    {
        [$search, $state] = $this->filters($request);
        $page = $this->query($search, $state)->latest('id')->paginate(25, ['*'], 'page', max(1, $request->integer('page', 1)));

        return $this->success([
            'items'  => collect($page->items())->map(fn (NewsletterSubscriber $s) => $this->row($s))->values(),
            'meta'   => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'from' => $page->firstItem(), 'to' => $page->lastItem()],
            'counts' => [
                'total'        => NewsletterSubscriber::count(),
                'active'       => NewsletterSubscriber::state('active')->count(),
                'pending'      => NewsletterSubscriber::state('pending')->count(),
                'inactive'     => NewsletterSubscriber::state('inactive')->count(),
                'unsubscribed' => NewsletterSubscriber::state('unsubscribed')->count(),
            ],
            'states' => NewsletterSubscriber::STATES,
        ]);
    }

    public function export(Request $request): JsonResponse
    {
        [$search, $state] = $this->filters($request);

        return $this->success(['items' => $this->query($search, $state)->latest('id')->limit(20000)->get()->map(fn ($s) => $this->row($s))->values()]);
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:0,1']]);
        $s = NewsletterSubscriber::findOrFail($id);
        if (! $s->is_verified || $s->unsubscribed_at) {
            return $this->error('Only verified subscribers who have not unsubscribed can be activated or deactivated.', 422, 'not_allowed');
        }
        $s->update(['status' => (int) $data['status'], 'updated_by' => Auth::id()]);

        return $this->success(['status' => $s->status], $s->status ? 'Subscriber activated.' : 'Subscriber deactivated.');
    }

    public function destroy(int $id): JsonResponse
    {
        NewsletterSubscriber::findOrFail($id)->delete();

        return $this->success(null, 'Subscriber deleted.');
    }

    public function events(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $events = Event::query()->select(['id', 'title', 'venue', 'city', 'event_date', 'event_end_date'])
            ->where('is_active', 1)->where('is_deleted', 0)
            ->when($search !== '', fn ($q) => $q->where('title', 'ilike', '%'.$search.'%'))
            ->orderByRaw('CASE WHEN event_date >= ? THEN 0 ELSE 1 END', [now()])
            ->orderByRaw('CASE WHEN event_date >= ? THEN event_date END ASC', [now()])
            ->orderByDesc('event_date')
            ->paginate(20, ['*'], 'page', max(1, $request->integer('page', 1)));

        $ids = collect($events->items())->pluck('id')->all();
        $eligible = $this->notifications->eligibleSubscribers($this->category);
        $eligibleCount = (clone $eligible)->count();
        $stats = Delivery::forCategory($this->category->key())->whereIn('reference_id', $ids)->groupBy('reference_id')
            ->select('reference_id')
            ->selectRaw("SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_count")
            ->selectRaw("SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count")
            ->selectRaw("SUM(CASE WHEN status IN ('pending', 'sending') THEN 1 ELSE 0 END) as in_progress_count")
            ->selectRaw('MAX(sent_at) as last_sent_at')
            ->get()->keyBy('reference_id');
        $notified = Delivery::forCategory($this->category->key())->whereIn('reference_id', $ids)->where('status', Delivery::STATUS_SENT)
            ->whereIn('newsletter_subscriber_id', (clone $eligible)->select('id'))
            ->groupBy('reference_id')->selectRaw('reference_id, COUNT(*) as total')->pluck('total', 'reference_id');

        return $this->success([
            'items' => collect($events->items())->map(function (Event $e) use ($stats, $notified, $eligibleCount) {
                $st = $stats->get($e->id);
                $sent = (int) ($st->sent_count ?? 0);
                $failed = (int) ($st->failed_count ?? 0);
                $busy = (int) ($st->in_progress_count ?? 0);
                $upcoming = $this->category->isUpcoming($e);

                return [
                    'id' => $e->id, 'title' => $e->title, 'venue' => $e->venue, 'city' => $e->city,
                    'event_date' => $e->event_date ? (string) $e->event_date : null,
                    'upcoming' => $upcoming, 'sent' => $sent, 'failed' => $failed,
                    'awaiting' => $upcoming ? max(0, $eligibleCount - (int) ($notified[$e->id] ?? 0)) : 0,
                    'last_sent_at' => $st->last_sent_at ?? null,
                    'status' => match (true) {
                        $busy > 0 => 'Sending', $failed > 0 && $sent > 0 => 'Partially sent', $failed > 0 => 'Failed',
                        $sent > 0 => 'Sent', default => 'Not sent',
                    },
                ];
            })->values(),
            'meta' => ['current_page' => $events->currentPage(), 'last_page' => $events->lastPage(), 'total' => $events->total(), 'from' => $events->firstItem(), 'to' => $events->lastItem()],
            'eligible' => $eligibleCount,
        ]);
    }

    public function eventHistory(Request $request, int $id): JsonResponse
    {
        $event = Event::select(['id', 'title', 'venue', 'city', 'event_date', 'is_active', 'is_deleted'])->findOrFail($id);
        $base = Delivery::forItem($this->category->key(), $event->id);
        $page = (clone $base)->with('subscriber:id,email')
            ->orderByRaw("CASE status WHEN 'failed' THEN 0 WHEN 'sending' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END")
            ->orderByDesc('last_attempt_at')
            ->paginate(25, ['*'], 'page', max(1, $request->integer('page', 1)));

        return $this->success([
            'event' => ['id' => $event->id, 'title' => $event->title, 'event_date' => (string) $event->event_date,
                'published' => $this->category->isPublished($event), 'upcoming' => $this->category->isUpcoming($event)],
            'counts' => (clone $base)->groupBy('status')->selectRaw('status, COUNT(*) as total')->pluck('total', 'status'),
            'items' => collect($page->items())->map(fn (Delivery $d) => [
                'email' => $d->subscriber?->email ?? '(deleted subscriber)', 'status' => $d->status, 'attempts' => $d->attempts,
                'send_count' => $d->send_count, 'last_trigger' => $d->last_trigger,
                'sent_at' => optional($d->sent_at)->toIso8601String(), 'last_attempt_at' => optional($d->last_attempt_at)->toIso8601String(),
                'last_error' => $d->last_error,
            ])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        ]);
    }

    public function sendEvent(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['mode' => ['required', Rule::in([NewsletterNotificationService::MODE_PENDING, NewsletterNotificationService::MODE_ALL])]]);
        $event = Event::query()->where('is_active', 1)->where('is_deleted', 0)->findOrFail($id);
        if (! $this->category->isUpcoming($event)) {
            return $this->error('This event has already started or passed, so an Upcoming Event email cannot be sent.', 422, 'not_upcoming');
        }
        @set_time_limit(0);
        try {
            $summary = $this->notifications->send($this->category, (int) $event->id, $data['mode'], NewsletterNotificationService::TRIGGER_MANUAL);
        } catch (Throwable $e) {
            Log::error('Newsletter manual send failed', ['event_id' => $event->id, 'error' => $e->getMessage()]);

            return $this->error('Sending failed unexpectedly. Details have been logged.', 500, 'send_failed');
        }
        if ($summary['reason']) {
            return $this->error($summary['reason'], 422, 'not_sendable');
        }

        return $this->success(['summary' => $summary], $summary['eligible'] === 0
            ? 'There are no active, verified subscribers opted in to Upcoming Events.'
            : "Sent: {$summary['sent']}, Failed: {$summary['failed']}, Skipped (already notified): {$summary['skipped']}.");
    }

    private function filters(Request $request): array
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:191'],
            'state'  => ['nullable', Rule::in(array_keys(NewsletterSubscriber::STATES))],
        ]);

        return [trim((string) ($data['search'] ?? '')), $data['state'] ?? null];
    }

    private function query(string $search, ?string $state)
    {
        return NewsletterSubscriber::query()
            ->when($search !== '', fn ($q) => $q->where('email', 'ilike', '%'.addcslashes($search, '%_\\').'%'))
            ->state($state);
    }

    private function row(NewsletterSubscriber $s): array
    {
        return [
            'id' => $s->id, 'email' => $s->email, 'state' => $s->state, 'state_label' => $s->state_label,
            'status' => (int) $s->status, 'is_verified' => (bool) $s->is_verified,
            'subscribed_at' => optional($s->subscribed_at)->toIso8601String(),
            'verified_at' => optional($s->verified_at)->toIso8601String(),
            'unsubscribed_at' => optional($s->unsubscribed_at)->toIso8601String(),
            'created_at' => optional($s->created_at)->toIso8601String(),
        ];
    }
}
