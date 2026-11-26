<?php

namespace App\Observers;

use App\Jobs\SendNewsletterNotifications;
use App\Models\Event;
use App\Services\Newsletter\Categories\UpcomingEventsCategory;

/**
 * Hooks the existing Event Management publish workflow without changing it.
 *
 * An event is published when is_active = 1 and is_deleted = 0 (the same rule the
 * public events pages use). It becomes published:
 *   - on create (the create form has no status field, so is_active defaults to 1);
 *   - when is_active changes 0 -> 1 via the edit form ("Save and Publish") or the list status toggle.
 * Any other update (editing a published event, unpublishing, deleting) sends nothing.
 */
class EventNewsletterObserver
{
    public function __construct(private readonly UpcomingEventsCategory $category)
    {
    }

    public function created(Event $event): void
    {
        if ($this->category->isPublished($event)) {
            $this->dispatch($event);
        }
    }

    public function updated(Event $event): void
    {
        if ($event->wasChanged('is_active')
            && (int) $event->getOriginal('is_active') === 0
            && $this->category->isPublished($event)) {
            $this->dispatch($event);
        }
    }

    private function dispatch(Event $event): void
    {
        // Delivery rows make this idempotent: re-publishing only reaches subscribers not yet notified.
        SendNewsletterNotifications::dispatch(UpcomingEventsCategory::KEY, (int) $event->id)->afterResponse();
    }
}
