<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ArtistGroupMember extends Model
{
    protected $fillable = [
        'artist_group_detail_id',
        'user_id',
        'name',
        'role',
        'art_form',
    ];

    public function group(): BelongsTo
    {
        return $this->belongsTo(ArtistGroupDetail::class, 'artist_group_detail_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
