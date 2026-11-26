<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class EmailService
{
    /**
     * Send a Mailable only when its config switch (config/mail_notifications.php) is on.
     * Never throws: a failed send is logged and reported as false.
     */
    public function send(string $to, string $mailable, array $data = [], bool $enabled = true): bool
    {
        if (! $enabled) {
            return false;
        }

        try {
            Mail::to($to)->send(new $mailable(...$data));

            return true;
        } catch (Throwable $e) {
            Log::error('Email sending failed', [
                'to' => $to,
                'mailable' => $mailable,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
