<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ArtistRegistrationHistory extends Model
{
    protected $fillable = [
        'artist_registration_id',
        'actor_id',
        'old_status',
        'new_status',
        'remarks',
    ];

    public function registration(): BelongsTo
    {
        return $this->belongsTo(ArtistRegistration::class, 'artist_registration_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
