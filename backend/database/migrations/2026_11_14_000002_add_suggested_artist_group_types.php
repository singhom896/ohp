<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Group types suggested by the Artist Group form sheet (India). Existing
 * types stay; "Other" is switched on so groups can describe their own type.
 * "Registered Cultural Group" makes the Group Registration Number mandatory.
 * The list stays editable in the admin console (Data Management).
 */
return new class extends Migration
{
    private const TYPES = ['Informal Artist Group', 'Registered Cultural Group', 'Performing Arts Troupe', 'Folk or Traditional Art Group'];

    public function up(): void
    {
        foreach (self::TYPES as $name) {
            $exists = DB::table('art_group_types')->where('country_id', 104)->whereRaw('LOWER(name) = ?', [strtolower($name)])->exists();
            if (! $exists) {
                DB::table('art_group_types')->insert([
                    'country_id' => 104, 'name' => $name, 'status' => 1, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
        DB::table('art_group_types')->where('country_id', 104)->where('name', 'Other')->update(['status' => 1, 'updated_at' => now()]);
    }

    public function down(): void
    {
        DB::table('art_group_types')->where('country_id', 104)->whereIn('name', self::TYPES)->delete();
    }
};
