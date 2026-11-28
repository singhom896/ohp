<?php

use App\Support\RegistrationNumber;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Registration numbers for Zonal Cultural Centre accounts:
 * OH-ZCC- + the user's primary key, 5 digits (users.id 123 -> OH-ZCC-00123).
 *
 * Every existing ZCC account (role 8, linked to a ZCC or not) is renumbered; old numbers
 * go to registration_number_history and login_histories.regno is updated.
 * down() restores the old numbers. New ZCC accounts get it from
 * RegistrationNumber::forUser().
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function () {
            $users = DB::table('users')->where('role_id', RegistrationNumber::ZCC_ROLE)
                ->orderBy('id')->lockForUpdate()->get(['id', 'regno']);
            $now = now();
            foreach ($users as $u) {
                $new = RegistrationNumber::formatZcc((int) $u->id);
                if ($u->regno === $new) {
                    continue;
                }
                DB::table('registration_number_history')->insert(['user_id' => $u->id, 'old_regno' => $u->regno, 'new_regno' => $new, 'changed_at' => $now]);
                DB::table('users')->where('id', $u->id)->update(['regno' => $new]);
                DB::table('login_histories')->where('user_id', $u->id)->update(['regno' => $new]);
            }
        });
    }

    public function down(): void
    {
        DB::transaction(function () {
            $rows = DB::table('registration_number_history')->where('new_regno', 'like', 'OH-ZCC-%')->orderByDesc('id')->get();
            foreach ($rows as $h) {
                DB::table('users')->where('id', $h->user_id)->where('regno', $h->new_regno)->update(['regno' => $h->old_regno]);
                DB::table('login_histories')->where('user_id', $h->user_id)->where('regno', $h->new_regno)->update(['regno' => $h->old_regno]);
            }
            DB::table('registration_number_history')->where('new_regno', 'like', 'OH-ZCC-%')->delete();
        });
    }
};
