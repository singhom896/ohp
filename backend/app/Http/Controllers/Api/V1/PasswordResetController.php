<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Mail\ResetPasswordLinkMail;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as PasswordRules;
use Throwable;

/**
 * Forgot / reset password for the Next.js website (/forgot-password, /reset-password).
 *
 *   POST /auth/forgot-password        { email, captcha, captcha_key }
 *   POST /auth/reset-password/check   { email, token }   is the link still valid?
 *   POST /auth/reset-password         { email, token, password, password_confirmation }
 *
 * Uses Laravel's password broker (table password_reset_tokens, config/auth.php
 * passwords.users: link valid `expire` minutes, one request per `throttle` seconds).
 * The email links to {FRONTEND_URL}/reset-password?token=...&email=...
 *
 * The forgot-password answer is the same whether or not the email is registered,
 * so the form cannot be used to find out who has an account.
 */
class PasswordResetController extends Controller
{
    use ApiResponse;

    private const GENERIC_SENT = 'If this email address is registered, a password reset link has been sent to it. Please check your inbox (and spam folder).';

    public function forgot(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email:rfc', 'max:255'],
        ] + CaptchaController::rules(), [
            'email.required' => 'Please enter your registered email address.',
            'email.email'    => 'Please enter a valid email address.',
        ] + CaptchaController::messages());

        $user = User::query()->whereRaw('LOWER(email) = ?', [mb_strtolower(trim($data['email']))])->first();
        if (! $user) {
            return $this->success(null, self::GENERIC_SENT);
        }

        $status = Password::broker()->sendResetLink(
            ['email' => $user->email],
            fn (User $user, string $token) => $this->mailLink($user, $token)
        );

        if ($status === Password::RESET_THROTTLED) {
            return $this->error('A reset link was sent recently. Please wait a minute before asking for another one.', 429, 'reset_throttled');
        }

        return $this->success(null, self::GENERIC_SENT);
    }

    /** Email the reset link ({FRONTEND_URL}/reset-password?token=&email=). Returns the link. */
    public function mailLink(User $user, string $token): string
    {
        $url = rtrim((string) config('app.frontend_url'), '/') . '/reset-password?' . http_build_query([
            'token' => $token,
            'email' => $user->email,
        ]);
        try {
            Mail::to($user->email)->send(new ResetPasswordLinkMail(
                name: (string) ($user->full_name ?: $user->firstname ?: 'User'),
                url: $url,
                minutes: (int) config('auth.passwords.users.expire', 60),
            ));
        } catch (Throwable $e) {
            Log::error('Password reset email could not be sent', ['user_id' => $user->id, 'error' => $e->getMessage()]);
            if (app()->isLocal()) {
                Log::info('Password reset link (local only)', ['user_id' => $user->id, 'url' => $url]);
            }
        }

        return $url;
    }

    /** Lets the reset page say up front that a link has expired or was already used. */
    public function check(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email:rfc', 'max:255'],
            'token' => ['required', 'string', 'max:255'],
        ]);

        $user = Password::broker()->getUser(['email' => $data['email']]);
        $valid = $user && Password::broker()->tokenExists($user, $data['token']);

        return $valid
            ? $this->success(['valid' => true])
            : $this->error('This password reset link is invalid or has expired. Please request a new one.', 422, 'invalid_reset_link');
    }

    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email'    => ['required', 'email:rfc', 'max:255'],
            'token'    => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:72', 'confirmed', PasswordRules::min(8)->letters()->mixedCase()->numbers()->symbols()],
        ], [
            'password.required'  => 'Please enter a new password.',
            'password.confirmed' => 'New password and confirm password do not match.',
        ]);

        $status = Password::broker()->reset($data, function (User $user, string $password) {
            // users has no remember_token column (JWT sessions), so only the password changes.
            $user->forceFill([
                'password'   => Hash::make($password),
                'updated_at' => now(),
            ])->save();

            event(new PasswordReset($user));
        });

        return match ($status) {
            Password::PASSWORD_RESET => $this->success(null, 'Your password has been reset. You can now log in with your new password.'),
            Password::INVALID_USER, Password::INVALID_TOKEN => $this->error('This password reset link is invalid or has expired. Please request a new one.', 422, 'invalid_reset_link'),
            default => $this->error('The password could not be reset. Please try again.', 422, 'reset_failed'),
        };
    }
}
