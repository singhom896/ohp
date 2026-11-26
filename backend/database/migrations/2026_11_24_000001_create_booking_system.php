<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Booking System.
 *
 * An Institute / Organisation (role 7) posts an event requirement. When it is
 * published, every approved Individual Artist (5) / Artist Group (6) whose
 * profile fits (art form, location, language, type) gets an email. Artists can
 * reply "Interested" / "Not available"; the organisation contacts them and the
 * booking is confirmed on call or by email, then recorded here. ZCC Nodal
 * Officers (8) and Admins see everything.
 *
 *  - booking_requirements  the posted requirement
 *  - booking_matches       one row per (requirement, matched artist): email, response, booking
 *  - menu modules + permissions:
 *      Event Requirements      (/requirements)   organisations (7)
 *      Opportunities           (/opportunities)  individual artists (5), groups (6)
 *      Booking Management      (/bookings)       Admins (1, 2) full, ZCC (8) view
 */
return new class extends Migration
{
    private const MODULES = [
        // [page_url, name, parent module_id (null = top level), position, icon]
        ['/requirements', 'Event Requirements', null, 3, 'bi bi-megaphone'],
        ['/opportunities', 'Opportunities & Bookings', null, 3, 'bi bi-briefcase'],
        ['/bookings', 'Booking Management', null, 3, 'bi bi-calendar2-check'],
    ];

    public function up(): void
    {
        Schema::create('booking_requirements', function (Blueprint $t) {
            $t->id();
            $t->string('reference', 30)->unique();                         // BR-2026-00001
            $t->foreignId('organisation_id')->constrained('users')->cascadeOnDelete();
            $t->string('title', 200);
            $t->string('programme_type', 100)->nullable();
            $t->unsignedBigInteger('art_form_id');                          // top-level art form
            $t->unsignedBigInteger('sub_art_form_id')->nullable();          // specific art form (individuals)
            $t->unsignedSmallInteger('artist_type')->nullable();            // 5 | 6 | null = both
            $t->unsignedBigInteger('language_id')->nullable();
            $t->unsignedSmallInteger('performers_needed')->nullable();
            $t->date('event_date');
            $t->date('event_end_date')->nullable();
            $t->string('event_time', 50)->nullable();
            $t->string('duration', 100)->nullable();
            $t->string('venue', 255);
            $t->string('city', 100)->nullable();
            $t->unsignedBigInteger('state_id');
            $t->unsignedBigInteger('district_id')->nullable();
            $t->string('match_scope', 10)->default('state');                // district | state | india
            $t->string('audience_size', 50)->nullable();
            $t->string('budget', 150)->nullable();                          // honorarium / fee offered (free text)
            $t->text('description');
            $t->text('technical_requirements')->nullable();
            $t->date('respond_by')->nullable();
            $t->string('contact_name', 150);
            $t->string('contact_mobile', 15);
            $t->string('contact_email', 191);
            $t->string('status', 20)->default('draft');                     // draft | open | booked | closed | cancelled
            $t->timestamp('published_at')->nullable();
            $t->timestamp('closed_at')->nullable();
            $t->text('close_reason')->nullable();
            $t->unsignedBigInteger('closed_by')->nullable();
            $t->timestamps();
            $t->index(['status', 'event_date']);
        });

        Schema::create('booking_matches', function (Blueprint $t) {
            $t->id();
            $t->foreignId('requirement_id')->constrained('booking_requirements')->cascadeOnDelete();
            $t->foreignId('artist_id')->constrained('users')->cascadeOnDelete();
            $t->string('email_status', 20)->default('pending');             // pending | sent | failed
            $t->timestamp('notified_at')->nullable();
            $t->string('email_error', 255)->nullable();
            $t->string('interest', 20)->default('pending');                 // pending | interested | not_available
            $t->text('interest_note')->nullable();
            $t->timestamp('responded_at')->nullable();
            $t->string('booking_status', 20)->nullable();                   // confirmed | completed | cancelled
            $t->string('confirmed_via', 10)->nullable();                    // call | email
            $t->date('confirmed_on')->nullable();
            $t->string('agreed_fee', 100)->nullable();
            $t->text('booking_remarks')->nullable();
            $t->unsignedBigInteger('booked_by')->nullable();
            $t->timestamp('booked_at')->nullable();
            $t->timestamps();
            $t->unique(['requirement_id', 'artist_id']);
            $t->index(['artist_id', 'booking_status']);
        });

        $now = now();
        $perms = [
            '/requirements'  => [7 => [1, 1, 1, 1]],
            '/opportunities' => [5 => [1, 0, 1, 0], 6 => [1, 0, 1, 0]],
            '/bookings'      => [1 => [1, 1, 1, 1], 2 => [1, 1, 1, 1], 8 => [1, 0, 0, 0]],
        ];
        foreach (self::MODULES as [$url, $name, $parent, $position, $icon]) {
            if (DB::table('modules')->where('page_url', $url)->exists()) {
                continue;
            }
            $moduleId = (int) DB::table('modules')->max('module_id') + 1;
            DB::table('modules')->insert([
                'module_id' => $moduleId, 'parent_id' => $parent, 'module_name' => $name, 'page_url' => $url,
                'position' => $position, 'icon_name' => $icon, 'active' => 1, 'created_by' => 1,
                'created_at' => $now, 'updated_at' => $now,
            ]);
            foreach ($perms[$url] as $roleId => [$v, $c, $e, $d]) {
                DB::table('permissions')->insert([
                    'role_id' => $roleId, 'module_id' => $moduleId,
                    'can_view' => $v, 'can_create' => $c, 'can_edit' => $e, 'can_delete' => $d,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        foreach (self::MODULES as [$url]) {
            $moduleId = DB::table('modules')->where('page_url', $url)->value('module_id');
            if ($moduleId) {
                DB::table('permissions')->where('module_id', $moduleId)->delete();
                DB::table('modules')->where('module_id', $moduleId)->delete();
            }
        }
        Schema::dropIfExists('booking_matches');
        Schema::dropIfExists('booking_requirements');
    }
};
