<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SetArtistPasswordMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly string $token) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Set your Opportunity Hub password');
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.password-setup',
            // Next.js page /set-password (Api\V1\PasswordSetupController)
            with: ['url' => rtrim((string) config('app.frontend_url'), '/').'/set-password?token='.urlencode($this->token)]
        );
    }
}
