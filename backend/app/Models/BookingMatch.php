<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One artist on one opportunity: either matched automatically (source
 * "matched", the artist was emailed) or sent an engagement request by the
 * partner (source "invited"). Holds the artist's response, the booking and
 * the partner's feedback.
 */
class BookingMatch extends Model
{
    public const INTEREST_LABELS = ['pending' => 'No response', 'interested' => 'Interested', 'not_available' => 'Not available'];
    /** Labels for engagement requests (invited). */
    public const INVITE_LABELS = ['pending' => 'Awaiting response', 'interested' => 'Accepted', 'not_available' => 'Declined'];
    public const BOOKING_LABELS = ['confirmed' => 'Booking Confirmed', 'completed' => 'Completed', 'cancelled' => 'Booking Cancelled'];
    public const CONFIRMED_VIA = ['call' => 'Phone call', 'email' => 'Email'];

    protected $fillable = [
        'requirement_id', 'artist_id', 'source', 'invited_at', 'invite_message', 'email_status', 'notified_at', 'email_error',
        'interest', 'interest_note', 'responded_at', 'booking_status', 'confirmed_via', 'confirmed_on', 'agreed_fee',
        'booking_remarks', 'booked_by', 'booked_at', 'saved_at', 'rating', 'feedback', 'feedback_at',
    ];

    protected function casts(): array
    {
        return [
            'notified_at' => 'datetime', 'responded_at' => 'datetime', 'booked_at' => 'datetime', 'confirmed_on' => 'date',
            'invited_at' => 'datetime', 'saved_at' => 'datetime', 'feedback_at' => 'datetime', 'rating' => 'integer',
        ];
    }

    public function isInvited(): bool
    {
        return $this->invited_at !== null;
    }

    public function interestLabel(): string
    {
        return ($this->isInvited() ? self::INVITE_LABELS : self::INTEREST_LABELS)[$this->interest] ?? (string) $this->interest;
    }

    public function requirement(): BelongsTo
    {
        return $this->belongsTo(BookingRequirement::class, 'requirement_id');
    }

    public function artist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'artist_id');
    }
}
