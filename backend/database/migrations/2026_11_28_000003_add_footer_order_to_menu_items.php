<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Separate ordering for the Footer Menu.
 *
 * menu_items.order_index orders the Main Menu; a menu can be in both menus
 * ("Main Menu & Footer Menu"), so the Footer Menu gets its own footer_order
 * (Administration -> Menus -> Manage Menu Ordering). Existing footer items
 * keep their current footer order (by order_index, id).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menu_items', function (Blueprint $t) {
            $t->integer('footer_order')->nullable()->after('order_index');
        });

        $n = 0;
        foreach (DB::table('menu_items')->where('is_footer', 1)->orderBy('order_index')->orderBy('id')->pluck('id') as $id) {
            DB::table('menu_items')->where('id', $id)->update(['footer_order' => ++$n]);
        }
    }

    public function down(): void
    {
        Schema::table('menu_items', function (Blueprint $t) {
            $t->dropColumn('footer_order');
        });
    }
};
