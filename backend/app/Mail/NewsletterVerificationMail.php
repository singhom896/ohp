<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** Newsletter: confirm the subscription (link valid for $expiresInHours hours). */
class NewsletterVerificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $verifyUrl,
        public readonly int $expiresInHours,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Opportunity Hub - Confirm your newsletter subscription');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.newsletter-verification');
    }
}