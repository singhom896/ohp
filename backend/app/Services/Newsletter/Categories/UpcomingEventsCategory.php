<?php

namespace App\Services\Newsletter\Categories;

use App\Mail\NewsletterEventMail;
use App\Models\Event;
use App\Services\Newsletter\Contracts\NotificationCategory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * "Upcoming Events": announces events from the existing Event Management module.
 *
 * Published = is_active = 1 and is_deleted = 0 (the rule the public events pages use).
 * Upcoming  = event_date not yet passed (the rule of the public "Upcoming" list).
 */
class UpcomingEventsCategory implements NotificationCategory
{
    public const KEY = 'upcoming_events';

    public function key(): string
    {
        return self::KEY;
    }

    public function label(): string
    {
        return 'Upcoming Events';
    }

    public function preferenceColumn(): string
    {
        return 'notify_upcoming_events';
    }

    public function enabled(): bool
    {
        return (bool) config('mail_notifications.newsletter_event', true);
    }

    public function find(int $referenceId): ?Model
    {
        return Event::with(['activeMedia.asset:id,url'])->find($referenceId);
    }

    public function isPublished(Event $event): bool
    {
        return (int) $event->is_active === 1 && (int) $event->is_deleted === 0;
    }

    public function isUpcoming(Event $event): bool
    {
        return $event->event_date !== null && Carbon::parse($event->event_date)->gte(now());
    }

    public function blockReason(Model $subject): ?string
    {
        if (! $this->isPublished($subject)) {
            return 'Event is not published.';
        }

        if (! $this->isUpcoming($subject)) {
            return 'This event has already started or passed, so an Upcoming Event email cannot be sent.';
        }

        return null;
    }

    public function mailable(): string
    {
        return NewsletterEventMail::class;
    }

    public function mailData(array $payload, string $unsubscribeUrl): array
    {
        return [$payload, $unsubscribeUrl];
    }

    public function payload(Model $subject): array
    {
        /** @var Event $event */
        $event = $subject;

        $start = Carbon::parse($event->event_date);
        $when = $start->format('d M Y, h:i A');

        if ($event->event_end_date) {
            $end = Carbon::parse(Carbon::parse($event->event_end_date)->toDateString().' '.($event->event_end_time ?: '00:00'));
            $when .= ' – '.($end->isSameDay($start) ? $end->format('h:i A') : $end->format('d M Y, h:i A'));
        }

        // India-only portal: venue, city (or district) and State / UT.
        $district = $event->district_id ? DB::table('districts')->where('id', $event->district_id)->value('DistrictName') : null;
        $state = $event->state_id ? DB::table('states')->where('id', $event->state_id)->value('StateName') : null;
        $location = collect([$event->venue, $event->city ?: $district, $state])
            ->map(fn ($part) => trim((string) $part))
            ->filter()
            ->unique()
            ->implode(', ');

        // CKEditor HTML -> plain text excerpt (escaped again in the Blade view).
        $description = html_entity_decode(strip_tags(str_replace(['</p>', '<br>', '<br/>', '<br />'], "\n", (string) $event->event_description)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $description = trim(preg_replace("/[ \t]+/", ' ', preg_replace("/\n{3,}/", "\n\n", $description)));

        $photo = $event->activeMedia->first(fn ($media) => $media->media_type === 'photo' && $media->asset?->url);
        $imagePath = $photo ? public_path($photo->asset->url) : null;

        return [
            'id' => $event->id,
            'title' => $event->title,
            'when' => $when,
            'location' => $location,
            'description' => Str::limit($description, 600),
            'image_url' => $photo ? asset($photo->asset->url) : null,
            'image_path' => $imagePath && is_file($imagePath) ? $imagePath : null,
            'detail_url' => rtrim((string) config('app.frontend_url'), '/').'/events/view?id='.$event->id,
        ];
    }
}
