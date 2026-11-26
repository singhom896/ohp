<?php

namespace App\Jobs;

use App\Services\BookingService;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Emails matched artists about a published booking requirement.
 *
 * Not ShouldQueue on purpose (no queue worker in this project): dispatched with
 * ->afterResponse(), so it runs after the organisation's response is sent.
 * booking_matches.email_status makes it safe to run more than once.
 */
class SendBookingNotifications
{
    use Dispatchable;

    public function __construct(public readonly int $requirementId) {}

    public function handle(BookingService $bookings): void
    {
        if (function_exists('ignore_user_abort')) {
            ignore_user_abort(true);
        }
        @set_time_limit(0);

        try {
            $bookings->notifyPending($this->requirementId);
        } catch (Throwable $e) {
            Log::error('Booking notification job failed', ['requirement_id' => $this->requirementId, 'error' => $e->getMessage()]);
        }
    }
}