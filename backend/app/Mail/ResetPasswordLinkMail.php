<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** Password reset link for the Next.js website (PasswordResetController). */
class ResetPasswordLinkMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $name,
        public readonly string $url,
        public readonly int $minutes = 60,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Opportunity Hub - Reset your password');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.reset-password-link');
    }
}
