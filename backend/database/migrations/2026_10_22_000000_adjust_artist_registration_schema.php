<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('artist_account_activations')) {
            Schema::create('artist_account_activations', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('user_id')->unique();
                $table->char('token_hash', 64)->unique();
                $table->timestamp('expires_at');
                $table->timestamps();
                $table->foreign('user_id', 'fk_artist_activation_user')->references('id')->on('users')->cascadeOnDelete();
            });
        }

        // Group and institution registrations store several art form IDs as comma-separated values.
        foreach (['artist_group_details', 'artist_institution_details'] as $tableName) {
            if (Schema::hasColumn($tableName, 'art_form_id') && DB::getDriverName() === 'mysql') {
                DB::statement("ALTER TABLE `{$tableName}` MODIFY `art_form_id` VARCHAR(255) NULL");
            }
        }

        if (! Schema::hasColumn('artist_registrations', 'public_profile')) {
            Schema::table('artist_registrations', function (Blueprint $table): void {
                $table->boolean('public_profile')->default(false)->after('consent');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('artist_registrations', 'public_profile')) {
            Schema::table('artist_registrations', function (Blueprint $table): void {
                $table->dropColumn('public_profile');
            });
        }
    }
};
