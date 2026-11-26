<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Organisation profile of an Engagement Partner account (role 11). */
class EngagementPartnerProfile extends Model
{
    public const ROLE = 11;

    /** Engagement Partner types (registration + profile). */
    public const TYPES = [
        'Hotel / Hospitality',
        'Wedding Organiser',
        'Event Organiser',
        'Festival Organiser',
        'Corporate',
        'Cultural Institution',
        'Government Department',
    ];

    /** Profile fields that must be filled before the partner can post opportunities. */
    public const REQUIRED = [
        'organisation_name', 'partner_type', 'contact_person', 'description', 'address', 'state_id', 'district_id',
        'city', 'pincode', 'official_email', 'contact_number',
    ];

    protected $fillable = [
        'user_id', 'organisation_name', 'partner_type', 'contact_person', 'designation', 'description', 'address',
        'state_id', 'district_id', 'city', 'pincode', 'official_email', 'contact_number', 'website', 'logo_path',
        'document_path', 'document_name', 'completed_at', 'verified_at', 'verified_by',
    ];

    protected function casts(): array
    {
        return ['completed_at' => 'datetime', 'verified_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Share of profile fields filled (required + logo + website), 0-100. */
    public function completion(): int
    {
        $fields = [...self::REQUIRED, 'designation', 'website', 'logo_path'];
        $filled = collect($fields)->filter(fn ($f) => filled($this->{$f}))->count();

        return (int) round($filled * 100 / count($fields));
    }

    public function isComplete(): bool
    {
        return collect(self::REQUIRED)->every(fn ($f) => filled($this->{$f}));
    }
}
