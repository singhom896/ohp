<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('artist_institution_details', function (Blueprint $table) {
            $table->json('supporting_document_paths')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('artist_institution_details', function (Blueprint $table) {
            $table->dropColumn('supporting_document_paths');
        });
    }
};
