<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One of the 7 Zonal Cultural Centres. Member States / UTs are in zcc_states
 * (many-to-many with states / art_regions); officials are users with role 8
 * and users.zcc_id = this id. See App\Support\ZccScope.
 */
class ZonalCulturalCentre extends Model
{
    protected $table = 'zonal_cultural_centres';

    protected $fillable = [
        'code', 'name', 'headquarters', 'contact_person', 'contact_designation',
        'contact_mobile', 'contact_mobile_alt', 'contact_email', 'position', 'status',
    ];

    public function stateLinks(): HasMany
    {
        return $this->hasMany(ZccState::class, 'zcc_id');
    }

    public function officials(): HasMany
    {
        return $this->hasMany(User::class, 'zcc_id');
    }

    /** "North Zone Cultural Centre (NZCC), Patiala" */
    public function label(): string
    {
        return "{$this->name} ({$this->code}), {$this->headquarters}";
    }
}
