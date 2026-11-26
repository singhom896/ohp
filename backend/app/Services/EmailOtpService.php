<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Shared email OTP verification state.
 *
 * Verification state is kept both in the `email_otps` table (authoritative,
 * one-time-use) and in the current browser session (convenience check so the
 * submitting request can be validated without another query round trip).
 */
class EmailOtpService
{
    public const PURPOSE_REGISTRATION = 'registration';
    public const PURPOSE_LOGIN = 'login';
    public const PURPOSE_FORGOT_PASSWORD = 'forgot_password';
    public const PURPOSE_EMAIL_CHANGE = 'email_change';

    public const ALLOWED_PURPOSES = [
        self::PURPOSE_REGISTRATION,
        self::PURPOSE_LOGIN,
        self::PURPOSE_FORGOT_PASSWORD,
        self::PURPOSE_EMAIL_CHANGE,
    ];

    /**
     * Check whether the given email address was verified for the purpose
     * in the current session and the verification still exists in storage.
     */
    public function isVerified(string $email, string $purpose): bool
    {
        if (! in_array($purpose, self::ALLOWED_PURPOSES, true)) {
            return false;
        }

        $email = Str::lower(trim($email));

        if ($email === '') {
            return false;
        }

        return session()->get("email_otp_verified.{$purpose}") === $email
            && DB::table('email_otps')
                ->where('email', $email)
                ->where('purpose', $purpose)
                ->whereNotNull('verified_at')
                ->exists();
    }

    /**
     * Consume a successful verification after the related action completes.
     * Makes the verification one-time-use and prevents OTP reuse.
     */
    public function consume(string $email, string $purpose): bool
    {
        if (! $this->isVerified($email, $purpose)) {
            return false;
        }

        $email = Str::lower(trim($email));

        DB::table('email_otps')
            ->where('email', $email)
            ->where('purpose', $purpose)
            ->delete();

        session()->forget("email_otp_verified.{$purpose}");

        return true;
    }
}
