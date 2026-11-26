<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** To ZCC Nodal Officers (role 8): an artist submitted a profile update / corrected application. */
class ZccArtistProfileActionMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $officerName,
        public readonly ?string $registrationId,
        public readonly string $artistName,
        public readonly string $registrationTypeLabel,
        public readonly string $actionLabel,
        public readonly string $statusLabel,
        public readonly int $revisionNumber,
        public readonly string $actionDate,
        public readonly string $reviewUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Opportunity Hub - '.$this->actionLabel.' ('.($this->registrationId ?: $this->artistName).')');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.zcc-artist-profile-action');
    }
}
