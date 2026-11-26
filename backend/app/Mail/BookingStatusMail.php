<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** To the artist: booking recorded as confirmed, or cancelled. */
class BookingStatusMail extends Mailable
{
    use Queueable, SerializesModels;

    /** @param array<string, string|null> $details */
    public function __construct(
        public readonly string $artistName,
        public readonly string $status,          // confirmed | cancelled
        public readonly array $details,
        public readonly ?string $remarks,
        public readonly string $viewUrl,
    ) {}

    public function envelope(): Envelope
    {
        $title = $this->details['Requirement'] ?? 'Opportunity Hub';

        return new Envelope(subject: $this->status === 'confirmed' ? "Booking Confirmed: {$title}" : "Booking Cancelled: {$title}");
    }

    public function content(): Content
    {
        return new Content(view: 'emails.booking-status');
    }
}