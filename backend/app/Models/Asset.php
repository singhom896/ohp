<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Asset extends Model
{
    protected $table = 'assets';

    protected $fillable = [
        'url',
        'size',
    ];

    public function eventMedia()
    {
        return $this->hasMany(EventMedia::class, 'assets_id', 'id');
    }

    public function documents()
    {
        return $this->hasMany(Document::class, 'assets_id', 'id');
    }

    public function getSizeMbAttribute()
    {
        return $this->size ? number_format($this->size / 1024 / 1024, 2) : '0.00';
    }
}
