<?php

namespace App\Mail;

use DateTimeInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** To the artist: profile update (or corrected application, $initial) approved. */
class ArtistProfileApprovedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $artistName,
        public readonly ?string $registrationId,
        public readonly bool $initial,
        public readonly ?string $remarks,
        public readonly string $loginUrl,
        public readonly ?DateTimeInterface $decidedAt = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->initial
            ? 'Your Opportunity Hub Profile Has Been Approved'
            : 'Your Opportunity Hub Profile Update Has Been Approved');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.artist-profile-approved');
    }
}
