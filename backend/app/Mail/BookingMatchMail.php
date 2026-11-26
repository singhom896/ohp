<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * To an artist whose profile fits a newly published opportunity, or (invited)
 * whom an Engagement Partner has sent an engagement request.
 */
class BookingMatchMail extends Mailable
{
    use Queueable, SerializesModels;

    /** @param array<string, string|null> $details */
    public function __construct(
        public readonly string $artistName,
        public readonly array $details,
        public readonly string $viewUrl,
        public readonly bool $invited = false,
        public readonly ?string $inviteMessage = null,
    ) {}

    public function envelope(): Envelope
    {
        $title = $this->details['Requirement'] ?? 'Opportunity Hub';

        return new Envelope(subject: ($this->invited ? 'Engagement Request: ' : 'New Performance Opportunity: ').$title);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.booking-match');
    }
}
