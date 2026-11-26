<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Content extends Model
{
    protected $table = 'contents';

    protected $fillable = [
        'menu_id',
        'slug',
        'title',
        'content',
        'is_active',
        'created_by',
    ];

    public function menu()
    {
        return $this->belongsTo(MenuItem::class, 'menu_id', 'id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by', 'id');
    }
}
