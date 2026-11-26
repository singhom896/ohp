<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ArtInstitutionPortfolioLink extends Model
{
    protected $fillable = [
        'artist_institution_detail_id',
        'url',
    ];

    public function institution(): BelongsTo
    {
        return $this->belongsTo(ArtistInstitutionDetail::class, 'artist_institution_detail_id');
    }
}
