<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ArtRegion extends Model
{
    protected $table = 'art_regions';

    public function country(): BelongsTo
    {
        return $this->belongsTo(Country::class);
    }
}
