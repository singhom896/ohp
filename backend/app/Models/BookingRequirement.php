<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An opportunity (event requirement) posted by an Engagement Partner (role 11).
 * Requirements posted earlier by role 7 accounts are kept as history.
 */
class BookingRequirement extends Model
{
    public const STATUS_DRAFT = 'draft';
    public const STATUS_OPEN = 'open';
    public const STATUS_BOOKED = 'booked';
    public const STATUS_CLOSED = 'closed';
    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_LABELS = [
        'draft' => 'Draft', 'open' => 'Open', 'booked' => 'Booked', 'closed' => 'Closed', 'cancelled' => 'Cancelled',
    ];

    public const SCOPES = ['district' => 'Same district', 'state' => 'Same State / UT', 'india' => 'All India'];

    /** public: matching artists are notified and it is listed publicly; invite_only: only invited artists see it. */
    public const VISIBILITY = ['public' => 'Public – notify matching artists', 'invite_only' => 'Invite only – artists I send requests to'];

    protected $fillable = [
        'reference', 'organisation_id', 'title', 'programme_type', 'art_form_id', 'sub_art_form_id', 'artist_type',
        'language_id', 'performers_needed', 'event_date', 'event_end_date', 'event_time', 'end_time', 'duration', 'venue', 'city',
        'state_id', 'district_id', 'match_scope', 'visibility', 'audience_size', 'budget', 'description', 'technical_requirements',
        'artist_requirements', 'additional_instructions',
        'respond_by', 'contact_name', 'contact_mobile', 'contact_email', 'status', 'published_at', 'closed_at',
        'close_reason', 'closed_by',
    ];

    protected function casts(): array
    {
        return [
            'event_date' => 'date', 'event_end_date' => 'date', 'respond_by' => 'date',
            'published_at' => 'datetime', 'closed_at' => 'datetime',
        ];
    }

    public function organisation(): BelongsTo
    {
        return $this->belongsTo(User::class, 'organisation_id');
    }

    public function matches(): HasMany
    {
        return $this->hasMany(BookingMatch::class, 'requirement_id');
    }

    /** Open or booked (more artists can still be booked) and the event has not passed. */
    public function isLive(): bool
    {
        return in_array($this->status, [self::STATUS_OPEN, self::STATUS_BOOKED], true)
            && $this->event_date && $this->event_date->endOfDay()->isFuture();
    }
}
