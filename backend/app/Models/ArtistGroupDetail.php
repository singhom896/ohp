<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class ArtistGroupDetail extends Model
{
    protected $fillable = [
        'artist_registration_id',
        'group_type',
        'group_type_id',
        'custom_group_type',
        'district_city',
        'establishment_year',
        'registration_number',
        'representative_name',
        'representative_designation',
        'total_members',
        'supporting_document_paths',
    ];

    protected function casts(): array
    {
        return [
            'establishment_year' => 'integer',
            'total_members' => 'integer',
            'supporting_document_paths' => 'array',
        ];
    }

    public function artistRegistration(): BelongsTo
    {
        return $this->belongsTo(ArtistRegistration::class, 'user_id', 'user_id');
    }

    public function members(): HasMany
    {
        return $this->hasMany(ArtistGroupMember::class);
    }

    public function artForms(): BelongsToMany
    {
        return $this->belongsToMany(
            ArtForm::class,
            'art_group_art_forms',
            'artist_group_detail_id',
            'art_form_id'
        );
    }
}
