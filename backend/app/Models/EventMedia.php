<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class EventMedia extends Model
{
    use HasFactory;

    protected $table = 'event_media';

    protected $fillable = [
        'event_id',
        'assets_id',
        'media_type',
        'video_url',
        'caption',
        'is_active',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function event()
    {
        return $this->belongsTo(Event::class, 'event_id', 'id');
    }

    public function asset()
    {
        return $this->belongsTo(Asset::class, 'assets_id', 'id');
    }
	
	   public function creator()
    {
        return $this->belongsTo(User::class, 'created_by', 'id');
    }
}
