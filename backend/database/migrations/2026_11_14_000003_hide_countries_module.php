<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Opportunity Hub is an India-only portal (the code base came from an
 * international registry). Hide Data Management -> Countries from the menu;
 * country_id stays India (104) behind the scenes.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('modules')->where('page_url', '/countries')->update(['active' => 0, 'updated_at' => now()]);
    }

    public function down(): void
    {
        DB::table('modules')->where('page_url', '/countries')->update(['active' => 1, 'updated_at' => now()]);
    }
};
