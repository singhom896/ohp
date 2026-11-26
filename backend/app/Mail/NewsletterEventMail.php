<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** Newsletter: a newly published upcoming event. */
class NewsletterEventMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly array $details,
        public readonly string $unsubscribeUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Upcoming Event: '.$this->details['title'].' - Opportunity Hub');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.newsletter-event');
    }
}