<?php

use App\Support\RegistrationNumber;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Registration IDs in the OH- format with one global sequence:
 *   Individual Artist OH-AI-, Artist Group OH-AG-, Organisation / Institute OH-AO-,
 *   Engagement Partner OH-EP- (App\Support\RegistrationNumber).
 *
 * Existing artist / partner accounts are renumbered in registration order
 * (created_at, id). Every old ID is kept in registration_number_history first,
 * and login_histories.regno is updated with it. Nothing is deleted; users.id
 * (used by every foreign key) does not change. Staff accounts keep their IDs.
 * down() restores the old IDs from the history table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('registration_number_history', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $t->string('old_regno', 50)->nullable();
            $t->string('new_regno', 50);
            $t->timestamp('changed_at');
            $t->index('old_regno');
        });

        DB::statement('CREATE SEQUENCE IF NOT EXISTS '.RegistrationNumber::SEQUENCE.' START 1');

        DB::transaction(function () {
            $users = DB::table('users')->whereIn('role_id', array_keys(RegistrationNumber::PREFIXES))
                ->orderBy('created_at')->orderBy('id')->lockForUpdate()->get(['id', 'role_id', 'regno']);
            $now = now();
            $n = 0;
            foreach ($users as $u) {
                $new = RegistrationNumber::format((int) $u->role_id, ++$n);
                DB::table('registration_number_history')->insert(['user_id' => $u->id, 'old_regno' => $u->regno, 'new_regno' => $new, 'changed_at' => $now]);
                DB::table('users')->where('id', $u->id)->update(['regno' => $new]);
                DB::table('login_histories')->where('user_id', $u->id)->update(['regno' => $new]);
            }
            // New registrations continue after the last number used.
            if ($n > 0) {
                DB::statement('SELECT setval(?, ?, true)', [RegistrationNumber::SEQUENCE, $n]);
            }
        });
    }

    public function down(): void
    {
        DB::transaction(function () {
            foreach (DB::table('registration_number_history')->orderBy('id')->get() as $h) {
                DB::table('users')->where('id', $h->user_id)->where('regno', $h->new_regno)->update(['regno' => $h->old_regno]);
                DB::table('login_histories')->where('user_id', $h->user_id)->where('regno', $h->new_regno)->update(['regno' => $h->old_regno]);
            }
        });
        Schema::dropIfExists('registration_number_history');
        DB::statement('DROP SEQUENCE IF EXISTS '.RegistrationNumber::SEQUENCE);
    }
};
