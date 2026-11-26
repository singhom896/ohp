<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Artist Application (profile update requests with ZCC / Admin approval) and
 * Newsletter, as in the BRICS Artist Registry, for Opportunity Hub.
 *
 *  - artist_profile_revisions        one row per profile change request (full snapshot as JSON)
 *  - artist_profile_revision_events  audit trail: draft saved, submitted, resubmitted, approved, rejected
 *  - newsletter_subscribers          footer sign-ups (email verification, unsubscribe)
 *  - newsletter_notifications        one delivery row per (category, record, subscriber)
 *  - menu modules + permissions:
 *      My Application   (/application)      artist roles 5, 6, 7
 *      Update Requests  (/profile-updates)  under Artist Management; Admins + ZCC (role 8)
 *      Newsletter       (/newsletter)       under CMS Management; Admins
 */
return new class extends Migration
{
    private const MODULES = [
        // [page_url, name, parent module_id (null = top level), position, icon]
        ['/application', 'My Application', null, 2, 'bi bi-journal-richtext'],
        ['/profile-updates', 'Update Requests', 33, 5, 'bi bi-patch-check'],
        ['/newsletter', 'Newsletter', 6, 8, 'bi bi-envelope-paper'],
    ];

    public function up(): void
    {
        Schema::create('artist_profile_revisions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $t->unsignedTinyInteger('registration_type');            // users.role_id: 5, 6, 7
            $t->unsignedInteger('revision_number');
            $t->string('status', 20)->default('draft');              // draft | submitted | approved | rejected
            $t->jsonb('snapshot');
            $t->unsignedBigInteger('submitted_by')->nullable();
            $t->timestamp('submitted_at')->nullable();
            $t->unsignedBigInteger('decided_by')->nullable();
            $t->timestamp('decided_at')->nullable();
            $t->text('remarks')->nullable();
            $t->string('ip_address', 45)->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'revision_number']);
            $t->index(['status', 'submitted_at']);
        });

        Schema::create('artist_profile_revision_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('revision_id')->constrained('artist_profile_revisions')->cascadeOnDelete();
            $t->unsignedBigInteger('user_id')->index();
            $t->unsignedBigInteger('actor_id')->nullable();
            $t->string('action', 30);
            $t->jsonb('changes')->nullable();
            $t->text('remarks')->nullable();
            $t->string('ip_address', 45)->nullable();
            $t->timestamps();
        });

        Schema::create('newsletter_subscribers', function (Blueprint $t) {
            $t->id();
            $t->string('email', 191)->unique();
            $t->char('verification_token', 64)->nullable()->index();
            $t->timestamp('verification_sent_at')->nullable();
            $t->boolean('is_verified')->default(false);
            $t->timestamp('verified_at')->nullable();
            $t->smallInteger('status')->default(0);
            $t->boolean('notify_upcoming_events')->default(true);
            $t->timestamp('subscribed_at')->nullable();
            $t->timestamp('unsubscribed_at')->nullable();
            $t->string('ip_address', 45)->nullable();
            $t->string('user_agent', 255)->nullable();
            $t->unsignedBigInteger('updated_by')->nullable();
            $t->timestamps();
        });

        Schema::create('newsletter_notifications', function (Blueprint $t) {
            $t->id();
            $t->string('category', 50);
            $t->unsignedBigInteger('reference_id');
            $t->foreignId('newsletter_subscriber_id')->constrained('newsletter_subscribers')->cascadeOnDelete();
            $t->string('status', 20)->default('pending');            // pending | sending | sent | failed
            $t->unsignedSmallInteger('attempts')->default(0);
            $t->unsignedSmallInteger('send_count')->default(0);
            $t->string('last_trigger', 20)->nullable();
            $t->timestamp('sent_at')->nullable();
            $t->timestamp('last_attempt_at')->nullable();
            $t->string('last_error', 255)->nullable();
            $t->timestamps();
            $t->unique(['category', 'reference_id', 'newsletter_subscriber_id'], 'newsletter_notifications_item_unique');
        });

        $now = now();
        $perms = [
            '/application'     => [5 => [1, 0, 0, 0], 6 => [1, 0, 0, 0], 7 => [1, 0, 0, 0]],
            '/profile-updates' => [1 => [1, 1, 1, 1], 2 => [1, 1, 1, 1], 8 => [1, 0, 1, 0]],
            '/newsletter'      => [1 => [1, 1, 1, 1], 2 => [1, 1, 1, 1]],
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
        Schema::dropIfExists('newsletter_notifications');
        Schema::dropIfExists('newsletter_subscribers');
        Schema::dropIfExists('artist_profile_revision_events');
        Schema::dropIfExists('artist_profile_revisions');
    }
};
