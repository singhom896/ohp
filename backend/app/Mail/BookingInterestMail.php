<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** To the organisation: a matched artist is interested in its requirement. */
class BookingInterestMail extends Mailable
{
    use Queueable, SerializesModels;

    /** @param array<string, string|null> $details */
    public function __construct(
        public readonly string $contactName,
        public readonly string $artistName,
        public readonly string $artistType,
        public readonly ?string $artistEmail,
        public readonly ?string $artistMobile,
        public readonly ?string $note,
        public readonly array $details,
        public readonly string $viewUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->artistName.' is interested in your requirement '.($this->details['Reference'] ?? ''));
    }

    public function content(): Content
    {
        return new Content(view: 'emails.booking-interest');
    }
}