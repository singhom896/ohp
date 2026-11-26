<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ArtistInstitutionDetail extends Model
{
    protected $fillable = [
        'artist_registration_id',
        'institution_type',
        'institution_type_id',
        'district_city',
        'establishment_year',
        'institution_registration_type',
        'registration_number',
        'representative_name',
        'representative_designation',
        'authorization_letter_path',
        'cultural_activities',
        'training_research_activities',
        'associated_artists',
        'brochure_path',
        'major_events',
        'collaborations',
        'registration_certificate_path',
        'supporting_document_paths',
    ];

    protected function casts(): array
    {
        return [
            'establishment_year' => 'integer',
            'associated_artists' => 'integer',
            'supporting_document_paths' => 'array',
        ];
    }

    public function artistRegistration(): BelongsTo
    {
        return $this->belongsTo(ArtistRegistration::class, 'user_id', 'user_id');
    }

    public function artForms(): BelongsToMany
    {
        return $this->belongsToMany(
            ArtForm::class,
            'art_institution_art_forms',
            'artist_institution_detail_id',
            'art_form_id'
        );
    }

    public function portfolioLinks(): HasMany
    {
        return $this->hasMany(ArtInstitutionPortfolioLink::class);
    }
}
