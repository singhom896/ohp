<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Document extends Model
{
    protected $fillable = [
        'assets_id',
        'parent_menu_id',
        'title',
        'description',
        'document_type',
        'document_url',
        'publish_start_date',
        'publish_end_date',
        'sortorder',
        'active',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'publish_start_date' => 'datetime',
        'publish_end_date'   => 'datetime',
        'active'             => 'boolean',
    ];

    public function asset()
    {
        return $this->belongsTo(Asset::class, 'assets_id', 'id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'created_by', 'id');
    }

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by', 'id');
    }

    public function menuItem()
    {
        return $this->belongsTo(MenuItem::class, 'parent_menu_id', 'id');
    }
}
