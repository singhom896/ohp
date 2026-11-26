<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('artist_registrations', function (Blueprint $table) {
            $table->id();
            $table->string('country', 100);
            $table->string('full_name');
            $table->string('region');
            $table->date('date_of_birth');
            $table->string('gender', 30)->nullable();
            $table->string('art_form');
            $table->string('subgenre')->nullable();
            $table->unsignedTinyInteger('years_of_practice')->nullable();
            $table->string('teacher_guru')->nullable();
            $table->string('languages')->nullable();
            $table->text('biography')->nullable();
            $table->string('email');
            $table->string('phone', 50)->nullable();
            $table->text('mailing_address')->nullable();
            $table->string('institutional_affiliation')->nullable();
            $table->string('profile_photo_path')->nullable();
            $table->string('portfolio_link', 2048)->nullable();
            $table->text('awards')->nullable();
            $table->string('id_document_path')->nullable();
            $table->boolean('consent')->default(false);
            $table->boolean('public_profile')->default(false);
            $table->string('status', 30)->default('pending');
            $table->timestamps();

            $table->unique(['country', 'email']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('artist_registrations');
    }
};
