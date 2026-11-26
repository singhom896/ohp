<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SetArtistPassword extends Notification
{
    use Queueable;

    public function __construct(private readonly string $token)
    {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage())
            ->subject('Set your Opportunity Hub password')
            ->greeting('Welcome to the Opportunity Hub')
            ->line('Your registration has been received. Use the secure link below to set your account password and activate your account.')
            ->action('Set account password', rtrim((string) config('app.frontend_url'), '/').'/set-password?token='.urlencode($this->token))
            ->line('This link expires in 24 hours. If you did not submit this registration, you can ignore this email.');
    }
}
