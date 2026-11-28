<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A member State / UT of a ZCC (states.id + matching art_regions.id). */
class ZccState extends Model
{
    protected $table = 'zcc_states';

    protected $fillable = ['zcc_id', 'state_id', 'region_id'];
}
