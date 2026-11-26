<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('artist_registrations', function (Blueprint $table) {
            $table->string('registration_type', 30)->default('individual')->after('id');
            $table->foreignId('user_id')->nullable()->after('registration_type')->constrained('users')->nullOnDelete();
            $table->date('date_of_birth')->nullable()->change();
            $table->dropUnique('artist_registrations_country_email_unique');
            $table->unique(
                ['country', 'email', 'registration_type'],
                'artist_registrations_country_email_type_unique'
            );
        });

        Schema::table('users', function (Blueprint $table) {
            $table->integer('state')->nullable()->change();
            $table->integer('district')->nullable()->change();
            $table->integer('gender')->nullable()->change();
        });

        Schema::create('artist_group_details', function (Blueprint $table) {
            $table->id();
            $table->foreignId('artist_registration_id')->unique()->constrained('artist_registrations')->cascadeOnDelete();
            $table->string('group_type', 100);
            $table->string('district_city');
            $table->unsignedSmallInteger('establishment_year')->nullable();
            $table->string('registration_number')->nullable();
            $table->string('representative_name');
            $table->string('representative_designation');
            $table->unsignedSmallInteger('total_members');
            $table->json('supporting_document_paths')->nullable();
            $table->timestamps();
        });

        Schema::create('artist_group_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('artist_group_detail_id')->constrained('artist_group_details')->cascadeOnDelete();
            $table->string('name');
            $table->string('role');
            $table->string('art_form');
            $table->timestamps();
        });

        Schema::create('artist_institution_details', function (Blueprint $table) {
            $table->id();
            $table->foreignId('artist_registration_id')->unique()->constrained('artist_registrations')->cascadeOnDelete();
            $table->string('institution_type', 100);
            $table->string('district_city');
            $table->unsignedSmallInteger('establishment_year')->nullable();
            $table->string('institution_registration_type', 100)->nullable();
            $table->string('registration_number')->nullable();
            $table->string('representative_name');
            $table->string('representative_designation');
            $table->string('authorization_letter_path')->nullable();
            $table->text('cultural_activities')->nullable();
            $table->text('training_research_activities')->nullable();
            $table->unsignedInteger('associated_artists')->nullable();
            $table->string('brochure_path')->nullable();
            $table->text('major_events')->nullable();
            $table->text('collaborations')->nullable();
            $table->string('registration_certificate_path')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('artist_institution_details');
        Schema::dropIfExists('artist_group_members');
        Schema::dropIfExists('artist_group_details');

        Schema::table('artist_registrations', function (Blueprint $table) {
            $table->dropUnique('artist_registrations_country_email_type_unique');
            $table->unique(['country', 'email'], 'artist_registrations_country_email_unique');
            $table->dropForeign(['user_id']);
            $table->dropColumn(['registration_type', 'user_id']);
            $table->date('date_of_birth')->nullable(false)->change();
        });
    }
};
