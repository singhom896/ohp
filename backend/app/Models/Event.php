<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Event extends Model
{
    use HasFactory;

    protected $table = 'events';

    protected $fillable = [
        'country_id',
        'region_id',
        'city',
        'title',
        'venue',
        'event_description',
        'event_date',
        'event_time',
        'event_end_date',
        'event_end_time',
        'organised_by',
        'mobile',
        'other_mobile',
        'email',
        'address',
        'pincode',
        'created_by',
        'updated_by',
        'is_active',
        'is_deleted',
        'deleted_by',
        'deleted_at',
        'lang_id',
        'state_id',
        'district_id',
    ];

    protected $casts = [
        'event_date' => 'datetime',
        'event_end_date' => 'datetime',
        'deleted_at' => 'datetime',
        'is_active' => 'boolean',
        'is_deleted' => 'boolean',
    ];

    public function country()
    {
        return $this->belongsTo(Country::class, 'country_id', 'id');
    }

    public function region()
    {
        return $this->belongsTo(ArtRegion::class, 'region_id', 'id');
    }

    public function media()
    {
        return $this->hasMany(EventMedia::class, 'event_id', 'id')->orderBy('id');
    }

    public function activeMedia()
    {
        return $this->hasMany(EventMedia::class, 'event_id', 'id')
            ->where('is_active', 1)
            ->orderBy('id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by', 'id');
    }

    public function updater()
    {
        return $this->belongsTo(User::class, 'updated_by', 'id');
    }
}
