<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Separates Engagement Partners from Artist / Group accounts.
 *
 *  - New role 11 "Engagement Partner" (hotels, event / wedding / festival
 *    organisers, corporates, cultural institutions, government departments).
 *    Role 7 "Artist Institution" (Organisation / Institute) stays an artist-side
 *    account: it now RECEIVES opportunities like roles 5 and 6 instead of
 *    posting them. Existing records are kept as they are.
 *  - engagement_partner_profiles, partner_shortlists, booking_media,
 *    artist_group_members, user_notifications.
 *  - booking_requirements / booking_matches: opportunity fields, invitations
 *    (engagement requests), saved opportunities, feedback.
 *  - Console modules + permissions for the new screens.
 *
 * No payment tables or columns: registration and profiles are free.
 */
return new class extends Migration
{
    private const PARTNER = 11;

    public function up(): void
    {
        $now = now();

        if (! DB::table('roles')->where('role_id', self::PARTNER)->exists()) {
            DB::table('roles')->insert([
                'id' => self::PARTNER, 'role_id' => self::PARTNER, 'name' => 'Engagement Partner', 'active' => 1,
                'created_at' => $now, 'updated_at' => $now,
            ]);
            DB::statement("SELECT setval(pg_get_serial_sequence('roles', 'id'), (SELECT MAX(id) FROM roles))");
        }

        Schema::create('engagement_partner_profiles', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $t->string('organisation_name', 200);
            $t->string('partner_type', 60);
            $t->string('contact_person', 150);
            $t->string('designation', 100)->nullable();
            $t->text('description')->nullable();
            $t->string('address', 500)->nullable();
            $t->unsignedBigInteger('state_id')->nullable();
            $t->unsignedBigInteger('district_id')->nullable();
            $t->string('city', 100)->nullable();
            $t->string('pincode', 6)->nullable();
            $t->string('official_email', 191)->nullable();
            $t->string('contact_number', 15)->nullable();
            $t->string('website', 255)->nullable();
            $t->string('logo_path', 255)->nullable();
            $t->string('document_path', 255)->nullable();
            $t->string('document_name', 150)->nullable();
            $t->timestamp('completed_at')->nullable();      // all required profile fields filled
            $t->timestamp('verified_at')->nullable();       // verified by an administrator
            $t->unsignedBigInteger('verified_by')->nullable();
            $t->timestamps();
            $t->index('partner_type');
        });

        Schema::table('booking_requirements', function (Blueprint $t) {
            $t->string('end_time', 50)->nullable()->after('event_time');
            $t->string('visibility', 20)->default('public')->after('match_scope');   // public | invite_only
            $t->text('artist_requirements')->nullable()->after('technical_requirements');
            $t->text('additional_instructions')->nullable()->after('artist_requirements');
        });

        Schema::table('booking_matches', function (Blueprint $t) {
            $t->string('source', 20)->default('matched')->after('artist_id');      // matched | invited
            $t->timestamp('invited_at')->nullable()->after('source');
            $t->text('invite_message')->nullable()->after('invited_at');
            $t->timestamp('saved_at')->nullable();                                  // artist saved the opportunity
            $t->unsignedTinyInteger('rating')->nullable();                          // partner feedback 1-5
            $t->text('feedback')->nullable();
            $t->timestamp('feedback_at')->nullable();
        });

        Schema::create('partner_shortlists', function (Blueprint $t) {
            $t->id();
            $t->foreignId('partner_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('artist_id')->constrained('users')->cascadeOnDelete();
            $t->string('note', 500)->nullable();
            $t->timestamps();
            $t->unique(['partner_id', 'artist_id']);
        });

        Schema::create('booking_media', function (Blueprint $t) {
            $t->id();
            $t->foreignId('requirement_id')->constrained('booking_requirements')->cascadeOnDelete();
            $t->foreignId('uploaded_by')->constrained('users')->cascadeOnDelete();
            $t->string('media_type', 10);                 // photo | video | youtube
            $t->string('path', 255)->nullable();          // uploaded file (public_uploads disk)
            $t->string('url', 500)->nullable();           // YouTube link
            $t->string('caption', 255)->nullable();
            $t->timestamps();
        });

        Schema::create('artist_group_members', function (Blueprint $t) {
            $t->id();
            $t->foreignId('group_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('artist_id')->constrained('users')->cascadeOnDelete();
            $t->string('member_role', 60);
            $t->timestamps();
            $t->unique(['group_id', 'artist_id']);
        });

        Schema::create('user_notifications', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $t->string('title', 200);
            $t->string('body', 1000)->nullable();
            $t->string('url', 255)->nullable();
            $t->timestamp('read_at')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'read_at']);
        });

        // ---- Console modules -------------------------------------------------
        // Role 7 (Organisation / Institute) no longer posts requirements; it gets
        // the artist-side opportunity screens. Its earlier requirement stays in
        // the database and remains visible to Admin / ZCC in Booking Management.
        $req = DB::table('modules')->where('page_url', '/requirements')->value('module_id');
        if ($req) {
            DB::table('permissions')->where('module_id', $req)->where('role_id', 7)->delete();
            DB::table('modules')->where('module_id', $req)->update(['module_name' => 'My Opportunities', 'position' => 3, 'updated_at' => $now]);
            $this->grant($req, [self::PARTNER => [1, 1, 1, 1]]);
        }
        $opp = DB::table('modules')->where('page_url', '/opportunities')->value('module_id');
        if ($opp) {
            DB::table('modules')->where('module_id', $opp)->update(['module_name' => 'Find Opportunities', 'icon_name' => 'bi bi-search', 'position' => 3, 'updated_at' => $now]);
            $this->grant($opp, [7 => [1, 0, 1, 0]]);
        }
        // Dashboard for partners.
        $this->grant(1, [self::PARTNER => [1, 0, 0, 0]]);

        $artist = [5 => [1, 0, 1, 0], 6 => [1, 0, 1, 0], 7 => [1, 0, 1, 0]];
        $admins = [1 => [1, 1, 1, 1], 2 => [1, 1, 1, 1], 8 => [1, 0, 0, 0]];
        foreach ([
            // url, name, icon, position, permissions
            ['/booking-requests',     'Booking Requests',          'bi bi-envelope-open',      4,  $artist],
            ['/performances',         'Confirmed Performances',    'bi bi-calendar2-check',    5,  $artist],
            ['/saved-opportunities',  'Saved Opportunities',       'bi bi-bookmark-heart',     6,  $artist],
            ['/engagement-history',   'Engagement History',        'bi bi-clock-history',      7,  $artist],
            ['/registration-card',    'Registration Card',         'bi bi-person-vcard',       8,  $artist],
            ['/group-members',        'Artist Members',            'bi bi-people',             2,  [6 => [1, 1, 1, 1]]],
            ['/notifications',        'Notifications',             'bi bi-bell',               9,  $artist + [self::PARTNER => [1, 0, 1, 0]]],
            ['/partner-profile',      'Organisation Profile',      'bi bi-building-gear',      2,  [self::PARTNER => [1, 0, 1, 0]]],
            ['/find-artists',         'Search Artists',            'bi bi-search',             4,  [self::PARTNER => [1, 0, 1, 0]]],
            ['/shortlist',            'Shortlisted Artists',       'bi bi-star',               5,  [self::PARTNER => [1, 0, 1, 1]]],
            ['/engagements',          'Engagement Requests',       'bi bi-send-check',         6,  [self::PARTNER => [1, 0, 1, 0]]],
            ['/partner-bookings',     'Bookings & History',        'bi bi-calendar2-check',    7,  [self::PARTNER => [1, 0, 1, 0]]],
            ['/partner-reports',      'Reports',                   'bi bi-bar-chart-line',     8,  [self::PARTNER => [1, 0, 0, 0]]],
            ['/engagement-partners',  'Engagement Partners',       'bi bi-buildings',          3,  $admins],
            ['/reports',              'Reports & MIS',             'bi bi-graph-up-arrow',     8,  $admins],
        ] as [$url, $name, $icon, $position, $perms]) {
            if (DB::table('modules')->where('page_url', $url)->exists()) {
                continue;
            }
            $moduleId = (int) DB::table('modules')->max('module_id') + 1;
            DB::table('modules')->insert([
                'module_id' => $moduleId, 'parent_id' => null, 'module_name' => $name, 'page_url' => $url,
                'position' => $position, 'icon_name' => $icon, 'active' => 1, 'created_by' => 1,
                'created_at' => $now, 'updated_at' => $now,
            ]);
            $this->grant($moduleId, $perms);
        }
    }

    /** @param array<int, array{0:int,1:int,2:int,3:int}> $perms role => [view, create, edit, delete] */
    private function grant(int $moduleId, array $perms): void
    {
        $now = now();
        foreach ($perms as $roleId => [$v, $c, $e, $d]) {
            DB::table('permissions')->updateOrInsert(
                ['role_id' => $roleId, 'module_id' => $moduleId],
                ['can_view' => $v, 'can_create' => $c, 'can_edit' => $e, 'can_delete' => $d, 'created_at' => $now, 'updated_at' => $now],
            );
        }
    }

    public function down(): void
    {
        foreach (['/booking-requests', '/performances', '/saved-opportunities', '/engagement-history', '/registration-card', '/group-members',
            '/notifications', '/partner-profile', '/find-artists', '/shortlist', '/engagements', '/partner-bookings', '/partner-reports',
            '/engagement-partners', '/reports'] as $url) {
            $moduleId = DB::table('modules')->where('page_url', $url)->value('module_id');
            if ($moduleId) {
                DB::table('permissions')->where('module_id', $moduleId)->delete();
                DB::table('modules')->where('module_id', $moduleId)->delete();
            }
        }
        $req = DB::table('modules')->where('page_url', '/requirements')->value('module_id');
        if ($req) {
            DB::table('permissions')->where('module_id', $req)->where('role_id', self::PARTNER)->delete();
            $this->grant($req, [7 => [1, 1, 1, 1]]);
            DB::table('modules')->where('module_id', $req)->update(['module_name' => 'Event Requirements']);
        }
        $opp = DB::table('modules')->where('page_url', '/opportunities')->value('module_id');
        if ($opp) {
            DB::table('permissions')->where('module_id', $opp)->where('role_id', 7)->delete();
            DB::table('modules')->where('module_id', $opp)->update(['module_name' => 'Opportunities & Bookings', 'icon_name' => 'bi bi-briefcase']);
        }
        DB::table('permissions')->where('module_id', 1)->where('role_id', self::PARTNER)->delete();

        Schema::dropIfExists('user_notifications');
        Schema::dropIfExists('artist_group_members');
        Schema::dropIfExists('booking_media');
        Schema::dropIfExists('partner_shortlists');
        Schema::table('booking_matches', fn (Blueprint $t) => $t->dropColumn(['source', 'invited_at', 'invite_message', 'saved_at', 'rating', 'feedback', 'feedback_at']));
        Schema::table('booking_requirements', fn (Blueprint $t) => $t->dropColumn(['end_time', 'visibility', 'artist_requirements', 'additional_instructions']));
        Schema::dropIfExists('engagement_partner_profiles');
        // Role 11 is kept if any user has it.
        if (! DB::table('users')->where('role_id', self::PARTNER)->exists()) {
            DB::table('roles')->where('role_id', self::PARTNER)->delete();
        }
    }
};
