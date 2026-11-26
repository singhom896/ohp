<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password as PasswordRules;

/**
 * First password for accounts created by an administrator (Artist Management
 * create form or bulk import). The "Set your password" email links to
 * {FRONTEND_URL}/set-password?token=... (Next.js page).
 *
 *   POST /auth/password-setup/check   { token }   is the link still valid? -> { email }
 *   POST /auth/password-setup         { token, password, password_confirmation }
 *
 * Tokens live in artist_account_activations (sha256 hash, 24 h expiry); setting
 * the password activates the account and deletes the token.
 */
class PasswordSetupController extends Controller
{
    use ApiResponse;

    private const INVALID = 'This password setup link is invalid or has expired. Please request a new link from Forgot Password or contact the administrator.';

    public function check(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:255']]);

        $activation = $this->activation($data['token']);
        if (! $activation) {
            return $this->error(self::INVALID, 422, 'invalid_setup_link');
        }

        $email = User::query()->whereKey($activation->user_id)->value('email');

        return $this->success(['email' => (string) $email]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token'    => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:72', 'confirmed', PasswordRules::min(8)->letters()->mixedCase()->numbers()->symbols()],
        ], [
            'password.required'  => 'Please enter a password.',
            'password.confirmed' => 'Password and confirm password do not match.',
        ]);

        $done = DB::transaction(function () use ($data): bool {
            $activation = DB::table('artist_account_activations')
                ->where('token_hash', hash('sha256', $data['token']))
                ->where('expires_at', '>', now())
                ->lockForUpdate()
                ->first();
            if (! $activation) {
                return false;
            }

            User::query()->whereKey($activation->user_id)->update([
                'password'          => Hash::make($data['password']),
                'active'            => 1,
                'email_verified_at' => now(),
                'updated_at'        => now(),
            ]);
            DB::table('artist_account_activations')->where('user_id', $activation->user_id)->delete();

            return true;
        });

        return $done
            ? $this->success(null, 'Your password has been set and your account is active. You can now log in.')
            : $this->error(self::INVALID, 422, 'invalid_setup_link');
    }

    private function activation(string $token): ?object
    {
        return DB::table('artist_account_activations')
            ->where('token_hash', hash('sha256', $token))
            ->where('expires_at', '>', now())
            ->first();
    }
}
