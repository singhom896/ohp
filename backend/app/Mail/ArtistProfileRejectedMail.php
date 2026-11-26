<?php

namespace App\Mail;

use DateTimeInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** To the artist: profile update (or corrected application, $initial) rejected with remarks. */
class ArtistProfileRejectedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $artistName,
        public readonly ?string $registrationId,
        public readonly string $remarks,
        public readonly bool $initial,
        public readonly string $loginUrl,
        public readonly ?DateTimeInterface $decidedAt = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Update Required – Opportunity Hub Profile');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.artist-profile-rejected');
    }
}
