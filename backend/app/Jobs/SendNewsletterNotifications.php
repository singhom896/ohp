<?php

namespace App\Jobs;

use App\Services\NewsletterNotificationService;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Sends one newsletter notification (any category) to eligible subscribers.
 *
 * Not ShouldQueue on purpose: the project has no queue worker running, so it is
 * dispatched with ->afterResponse() and runs in the same PHP process once the
 * admin's response has been sent. Add `implements ShouldQueue` if a worker is
 * introduced later; the job body does not need to change.
 */
class SendNewsletterNotifications
{
    use Dispatchable;

    public function __construct(
        public readonly string $category,
        public readonly int $referenceId,
        public readonly string $mode = NewsletterNotificationService::MODE_PENDING,
        public readonly string $trigger = NewsletterNotificationService::TRIGGER_AUTO,
    ) {
    }

    public function handle(NewsletterNotificationService $service): void
    {
        if (function_exists('ignore_user_abort')) {
            ignore_user_abort(true);
        }
        @set_time_limit(0);

        try {
            $service->send($this->category, $this->referenceId, $this->mode, $this->trigger);
        } catch (Throwable $e) {
            // Never let a notification problem surface as an error on the record save.
            Log::error('Newsletter notification job failed', [
                'category' => $this->category,
                'reference_id' => $this->referenceId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
