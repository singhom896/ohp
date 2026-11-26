<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Basic self-registration (Next.js /register) fields:
 *  - account_name:      Group name (role 6) or Organisation / Institute name (role 7)
 *  - organisation_type: Organisation type picked at registration (role 7)
 *  - terms/privacy acceptance timestamp + the policy version accepted
 * Detailed group / institution profiles are filled after login.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('account_name', 255)->nullable()->after('full_name');
            $table->string('organisation_type', 100)->nullable()->after('account_name');
            $table->timestamp('terms_accepted_at')->nullable()->after('mobile_verified_at');
            $table->timestamp('privacy_accepted_at')->nullable()->after('terms_accepted_at');
            $table->string('policy_version', 20)->nullable()->after('privacy_accepted_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['account_name', 'organisation_type', 'terms_accepted_at', 'privacy_accepted_at', 'policy_version']);
        });
    }
};
