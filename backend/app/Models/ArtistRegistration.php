<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasOneThrough;

class ArtistRegistration extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_RETURNED = 'returned';

    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'user_id',
        'art_form_id',
        'other_art_form',
        'subgenre_id',
        'other_subgenre',
        'years_of_practice',
        'teacher_guru',
        'language_id',
        'biography',
        'institutional_affiliation',
        'profile_photo',
        'portfolio_link',
        'identity_document',
        'awards',
        'consent',
        'public_profile',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'years_of_practice' => 'integer',
            'consent' => 'boolean',
            'public_profile' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function groupDetails(): HasOne
    {
        return $this->hasOne(ArtistGroupDetail::class, 'user_id', 'user_id');
    }

    public function institutionDetails(): HasOne
    {
        return $this->hasOne(ArtistInstitutionDetail::class, 'user_id', 'user_id');
    }

    public function histories(): HasMany
    {
        return $this->hasMany(ArtistRegistrationHistory::class)->latest();
    }

    public function countryMaster(): HasOneThrough
    {
        return $this->hasOneThrough(Country::class, User::class, 'id', 'id', 'user_id', 'country_id');
    }

    public function regionMaster(): HasOneThrough
    {
        return $this->hasOneThrough(ArtRegion::class, User::class, 'id', 'id', 'user_id', 'region_id');
    }

    public function artForm(): BelongsTo
    {
        return $this->belongsTo(ArtForm::class, 'art_form_id');
    }

    public function subgenreForm(): BelongsTo
    {
        return $this->belongsTo(ArtForm::class, 'subgenre_id');
    }

    public function spokenLanguages(): BelongsToMany
    {
        return $this->belongsToMany(
            ArtLanguage::class,
            'artist_registration_languages',
            'artist_registration_id',
            'art_language_id'
        );
    }
}
