<?php

namespace App\Mail;

use DateTimeInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** To the artist: a profile update / corrected application was received and awaits ZCC review. */
class ArtistProfileUpdateSubmittedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $artistName,
        public readonly ?string $registrationId,
        public readonly int $revisionNumber,
        public readonly string $actionLabel,
        public readonly string $statusLabel,
        public readonly string $dashboardUrl,
        public readonly ?DateTimeInterface $submittedAt = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Opportunity Hub - Submission Received: '.$this->actionLabel);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.artist-profile-update-submitted');
    }
}
