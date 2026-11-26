<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gallery cards on the website show a location line, and a play button that
 * opens a video when one is linked (CMS Management -> Gallery).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('galleries', function (Blueprint $table) {
            $table->string('location', 150)->nullable()->after('title');
            $table->string('video_url', 500)->nullable()->after('location');
        });
    }

    public function down(): void
    {
        Schema::table('galleries', function (Blueprint $table) {
            $table->dropColumn(['location', 'video_url']);
        });
    }
};
