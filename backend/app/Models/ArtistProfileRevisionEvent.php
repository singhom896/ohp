<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ArtistProfileRevisionEvent extends Model
{
    protected $fillable = [
        'revision_id',
        'user_id',
        'actor_id',
        'action',
        'changes',
        'remarks',
        'ip_address',
    ];

    protected function casts(): array
    {
        return ['changes' => 'array'];
    }

    public function revision(): BelongsTo
    {
        return $this->belongsTo(ArtistProfileRevision::class, 'revision_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}