<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Mobile (SMS) OTPs - same shape as email_otps, keyed by mobile number. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mobile_otps', function (Blueprint $table) {
            $table->id();
            $table->string('mobile', 15);
            $table->string('purpose', 40);
            $table->string('otp_hash');
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('expires_at')->useCurrent();
            $table->timestamp('last_sent_at')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();
            $table->unique(['mobile', 'purpose']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mobile_otps');
    }
};
