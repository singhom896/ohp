<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Fields for the after-login "My Profile" form (Opportunity Hub form sheets:
 * Individual Artist, Artist Group, Organisation / Institute). Everything is
 * stored in the existing registration tables so Artist Management keeps
 * showing one record per artist.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('artist_registrations', function (Blueprint $table) {
            $table->string('stage_name', 150)->nullable();
            $table->string('art_tradition', 255)->nullable();          // gharana / regional style
            $table->timestamp('declaration_accepted_at')->nullable();
        });

        Schema::table('artist_group_details', function (Blueprint $table) {
            $table->unsignedBigInteger('primary_art_form_id')->nullable();
            $table->boolean('public_profile')->default(false);
            $table->timestamp('declaration_accepted_at')->nullable();
        });
        // Up to 5 comma separated paths.
        DB::statement('ALTER TABLE artist_group_details ALTER COLUMN supporting_document TYPE text');

        Schema::table('artist_institution_details', function (Blueprint $table) {
            $table->string('sub_category', 150)->nullable();
            $table->string('hosts_programmes', 20)->nullable();          // yes / no / occasionally
            $table->text('programme_types')->nullable();                 // comma separated labels
            $table->string('audience_size', 50)->nullable();
            $table->string('venue_availability', 100)->nullable();
            $table->text('venue_types')->nullable();
            $table->text('venue_facilities')->nullable();
            $table->string('venue_locations', 500)->nullable();
            $table->boolean('public_profile')->default(false);
            $table->timestamp('authorisation_declared_at')->nullable();
            $table->timestamp('declaration_accepted_at')->nullable();
        });
        DB::statement('ALTER TABLE artist_institution_details ALTER COLUMN supporting_documents TYPE text');

        // Awards entered by the artist: free-text name, master award optional.
        Schema::table('artist_awards', function (Blueprint $table) {
            $table->string('award_name', 255)->nullable();
        });
        DB::statement('ALTER TABLE artist_awards ALTER COLUMN award_id DROP NOT NULL');

        Schema::table('users', function (Blueprint $table) {
            $table->boolean('profile_completed')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('profile_completed'));
        Schema::table('artist_awards', fn (Blueprint $t) => $t->dropColumn('award_name'));
        Schema::table('artist_institution_details', fn (Blueprint $t) => $t->dropColumn([
            'sub_category', 'hosts_programmes', 'programme_types', 'audience_size', 'venue_availability',
            'venue_types', 'venue_facilities', 'venue_locations', 'public_profile',
            'authorisation_declared_at', 'declaration_accepted_at',
        ]));
        Schema::table('artist_group_details', fn (Blueprint $t) => $t->dropColumn(['primary_art_form_id', 'public_profile', 'declaration_accepted_at']));
        Schema::table('artist_registrations', fn (Blueprint $t) => $t->dropColumn(['stage_name', 'art_tradition', 'declaration_accepted_at']));
    }
};
