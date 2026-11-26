<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** Newsletter: subscription confirmed, with the unsubscribe link. */
class NewsletterSubscribedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $email,
        public readonly string $unsubscribeUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Opportunity Hub - Newsletter subscription confirmed');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.newsletter-subscribed');
    }
}