<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Zonal Cultural Centres (ZCCs) and zone-based artist management.
 *
 *  zonal_cultural_centres  the 7 ZCCs of the Ministry of Culture (seeded by ZccSeeder)
 *  zcc_states              member States / UTs of each ZCC. MANY-TO-MANY: a State can
 *                          belong to several ZCCs (e.g. Rajasthan: NZCC, WZCC, NCZCC);
 *                          every ZCC mapped to an artist's State can review that artist.
 *                          Holds both state ids in use: states.id (users.state, set by My
 *                          Profile / registration) and art_regions.id (users.region_id,
 *                          set by admin-created and imported registrations).
 *  users.zcc_id            the ZCC a ZCC official (role 8) belongs to.
 *
 * Artist registration status (users.verified_status): 0 Pending, 1 Approved,
 * 2 Rejected, 3 Changes Requested (new: returned to the artist for correction).
 *
 * Data fix: self-registration used to store verified_status = 1, so new artists
 * showed "Approved" before any review. Self-registered artist accounts that were
 * never approved by anyone (no approval history, no reviewer-approved update) go
 * back to Pending. Their ids are kept in zcc_status_corrections so down() can undo it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('zonal_cultural_centres', function (Blueprint $t) {
            $t->id();
            $t->string('code', 10)->unique();             // NZCC, EZCC, ...
            $t->string('name', 150);
            $t->string('headquarters', 100);
            $t->string('contact_person', 150)->nullable();
            $t->string('contact_designation', 150)->nullable();
            $t->string('contact_mobile', 15)->nullable();
            $t->string('contact_mobile_alt', 15)->nullable();
            $t->string('contact_email', 191)->nullable();
            $t->unsignedSmallInteger('position')->default(0);
            $t->smallInteger('status')->default(1);
            $t->timestamps();
        });

        Schema::create('zcc_states', function (Blueprint $t) {
            $t->id();
            $t->foreignId('zcc_id')->constrained('zonal_cultural_centres')->cascadeOnDelete();
            $t->unsignedBigInteger('state_id');             // states.id
            $t->unsignedBigInteger('region_id')->nullable(); // art_regions.id
            $t->timestamps();
            $t->unique(['zcc_id', 'state_id']);
            $t->index('state_id');
            $t->index('region_id');
        });

        Schema::table('users', function (Blueprint $t) {
            $t->foreignId('zcc_id')->nullable()->after('region_id')->constrained('zonal_cultural_centres')->nullOnDelete();
        });

        Schema::create('zcc_status_corrections', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('user_id');
            $t->smallInteger('old_status');
            $t->smallInteger('new_status');
            $t->timestamp('corrected_at');
        });

        DB::transaction(function () {
            $now = now();
            $ids = DB::table('users as u')
                ->whereIn('u.role_id', [5, 6, 7])
                ->where('u.verified_status', 1)
                ->whereNull('u.created_by') // self-registered
                ->whereNotExists(fn ($q) => $q->from('artist_status_histories as h')->whereColumn('h.user_id', 'u.id')->where('h.new_status', 1))
                ->whereNotExists(fn ($q) => $q->from('artist_profile_revisions as r')->whereColumn('r.user_id', 'u.id')
                    ->where('r.status', 'approved')->whereNotNull('r.decided_by'))
                ->pluck('u.id');

            foreach ($ids as $id) {
                DB::table('zcc_status_corrections')->insert(['user_id' => $id, 'old_status' => 1, 'new_status' => 0, 'corrected_at' => $now]);
            }
            if ($ids->isNotEmpty()) {
                DB::table('users')->whereIn('id', $ids)->update(['verified_status' => 0, 'updated_at' => $now]);
            }
        });
    }

    public function down(): void
    {
        foreach (DB::table('zcc_status_corrections')->get() as $c) {
            DB::table('users')->where('id', $c->user_id)->where('verified_status', $c->new_status)->update(['verified_status' => $c->old_status]);
        }
        DB::table('users')->where('verified_status', 3)->update(['verified_status' => 0]);

        Schema::dropIfExists('zcc_status_corrections');
        Schema::table('users', function (Blueprint $t) {
            $t->dropConstrainedForeignId('zcc_id');
        });
        Schema::dropIfExists('zcc_states');
        Schema::dropIfExists('zonal_cultural_centres');
    }
};
