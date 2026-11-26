<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('artist_registration_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('artist_registration_id')
                ->constrained('artist_registrations')
                ->cascadeOnDelete();
            $table->foreignId('actor_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();
            $table->string('old_status', 30);
            $table->string('new_status', 30);
            $table->text('remarks')->nullable();
            $table->timestamps();

            $table->index(['artist_registration_id', 'new_status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('artist_registration_histories');
    }
};
