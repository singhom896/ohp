<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class EmailOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $otp,
        public readonly string $purpose,
        public readonly int $validityMinutes = 10
    ) {}

    public function envelope(): Envelope
    {
        $subject = match ($this->purpose) {
            'registration' => 'Opportunity Hub - Email Verification OTP',
            'login' => 'Opportunity Hub - Login OTP',
            'forgot_password' => 'Opportunity Hub - Password Reset OTP',
            'email_change' => 'Opportunity Hub - Email Change Verification OTP',
            default => 'Opportunity Hub - Email Verification',
        };

        return new Envelope(subject: $subject);
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.otp',
            with: [
                'otp' => $this->otp,
                'purpose' => $this->purpose,
                'validityMinutes' => $this->validityMinutes,
            ]
        );
    }
}
