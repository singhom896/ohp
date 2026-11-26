<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\ArtistProfileRevision;
use App\Models\EngagementPartnerProfile;
use App\Models\LoginHistory;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rules\Password as PasswordRules;
use Jenssegers\Agent\Agent;
use Tymon\JWTAuth\Exceptions\JWTException;
use Tymon\JWTAuth\Exceptions\TokenExpiredException;

/**
 * Stateless JWT authentication for the Next.js frontend.
 *
 *   POST /api/v1/auth/login     { login, password }        -> token + user
 *   POST /api/v1/auth/register  { account_type, first_name, ... } -> user
 *   POST /api/v1/auth/refresh   (Bearer, may be expired)    -> new token + user
 *   GET  /api/v1/auth/me        (Bearer)                    -> user
 *   POST /api/v1/auth/logout    (Bearer)                    -> revokes token
 */
class AuthController extends Controller
{
    use ApiResponse;

    /** Self-registration account types -> roles.role_id */
    private const ACCOUNT_TYPE_ROLES = [
        // Artist / Group registration
        'artist'       => 5, // Artist
        'group'        => 6, // Artist Group
        'organisation' => 7, // Artist Institution (Organisation / Institute) - artist side
        // Engagement Partner registration (hotels, organisers, corporates, ...)
        'partner'      => EngagementPartnerProfile::ROLE,
    ];

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'login'    => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
        ] + CaptchaController::rules(), [
            'login.required'    => 'Please enter your registered mobile number or email.',
            'password.required' => 'Please enter your password.',
        ] + CaptchaController::messages());

        $login = trim($data['login']);
        $isEmail = filter_var($login, FILTER_VALIDATE_EMAIL) !== false;

        $query = User::with('role');
        $isEmail
            ? $query->whereRaw('LOWER(email) = ?', [mb_strtolower($login)])
            : $query->where('mobile', $login);

        // mobile is not unique in the users table; refuse to guess.
        $matches = $query->limit(2)->get();
        if (!$isEmail && $matches->count() > 1) {
            return $this->error(
                'This mobile number is linked to more than one account. Please sign in with your email.',
                422,
                'ambiguous_login'
            );
        }

        $user = $matches->first();
        if (!$user || !$user->verifyPassword($data['password'])) {
            return $this->error('Invalid credentials. Please try again.', 401, 'invalid_credentials');
        }

        if ($reason = $user->accountBlockReason()) {
            return $this->error($reason, 403, 'account_blocked');
        }

        $token = auth('api')->login($user);

        $user->forceFill(['last_login_at' => now()])->save();
        $this->recordLogin($request, $user);

        return $this->tokenResponse($token, $user, 'Logged in successfully.');
    }

    /** Letters (any script), spaces, dots, apostrophes, hyphens. */
    private const PERSON_NAME = "regex:/^[\pL\pM\s.'-]+$/u";

    /** Group / organisation names: also digits and & , ( ) / */
    private const ORG_NAME = "regex:/^[\pL\pM\pN\s&.,'()\/-]+$/u";

    /**
     * Basic self-registration (spec: Opportunity Hub_Forms.xlsx). Fields by
     * account_type:
     *   artist:       first_name, last_name
     *   group:        group_name, first_name, last_name          (leader)
     *   organisation: organisation_name, organisation_type,
     *                 first_name, last_name, designation          (authorised contact)
     * Common: mobile, email, email_otp_token (when email OTP is on, see
     * config/otp.php), password + confirmation, terms, privacy, captcha.
     * Detailed profiles are completed after login.
     */
    public function register(Request $request): JsonResponse
    {
        $type = (string) $request->input('account_type');
        $otpOn = RegistrationController::enabled('email');
        $mobileOtpOn = RegistrationController::enabled('mobile');

        $rules = [
            'account_type'    => ['required', 'in:' . implode(',', array_keys(self::ACCOUNT_TYPE_ROLES))],
            'first_name'      => ['required', 'string', 'max:100', self::PERSON_NAME],
            'last_name'       => ['required', 'string', 'max:100', self::PERSON_NAME],
            'mobile'          => ['required', 'regex:/^[6-9][0-9]{9}$/', 'unique:users,mobile'],
            'email'           => ['required', 'email:rfc', 'max:255', 'unique:users,email'],
            'email_otp_token' => [$otpOn ? 'required' : 'nullable', 'string', 'max:128'],
            'mobile_otp_token' => [$mobileOtpOn ? 'required' : 'nullable', 'string', 'max:128'],
            'password'        => ['required', 'string', 'max:72', 'confirmed', PasswordRules::min(8)->letters()->numbers()],
            'terms'           => ['accepted'],
            'privacy'         => ['accepted'],
        ];
        if ($type === 'group') {
            $rules['group_name'] = ['required', 'string', 'max:150', self::ORG_NAME];
        }
        if ($type === 'organisation') {
            $rules['organisation_name'] = ['required', 'string', 'max:200', self::ORG_NAME];
            $rules['organisation_type'] = ['required', 'in:' . implode(',', RegistrationController::ORGANISATION_TYPES)];
            $rules['designation'] = ['required', 'string', 'max:100', self::ORG_NAME];
        }
        if ($type === 'partner') {
            $rules['organisation_name'] = ['required', 'string', 'max:200', self::ORG_NAME];
            $rules['partner_type'] = ['required', 'in:' . implode(',', EngagementPartnerProfile::TYPES)];
            $rules['designation'] = ['nullable', 'string', 'max:100', self::ORG_NAME];
            $rules['address'] = ['nullable', 'string', 'max:500'];
        }

        $request->merge(['email' => mb_strtolower(trim((string) $request->input('email')))]);

        $data = $request->validate($rules + CaptchaController::rules(), CaptchaController::messages() + [
            'first_name.required'        => 'Please enter the first name.',
            'last_name.required'         => 'Please enter the last name.',
            'first_name.regex'           => 'First name can only contain letters, spaces, dots, hyphens and apostrophes.',
            'last_name.regex'            => 'Last name can only contain letters, spaces, dots, hyphens and apostrophes.',
            'group_name.required'        => 'Please enter the group name.',
            'group_name.regex'           => 'Group name contains characters that are not allowed.',
            'organisation_name.required' => 'Please enter the organisation / institute name.',
            'organisation_name.regex'    => 'Organisation name contains characters that are not allowed.',
            'organisation_type.required' => 'Please select the organisation type.',
            'organisation_type.in'       => 'Please select a valid organisation type.',
            'partner_type.required'      => 'Please select the engagement partner type.',
            'partner_type.in'            => 'Please select a valid engagement partner type.',
            'designation.required'       => 'Please enter the designation.',
            'mobile.required'            => 'Please enter the mobile number.',
            'mobile.regex'               => 'Please enter a valid 10-digit Indian mobile number.',
            'mobile.unique'              => 'This mobile number is already registered.',
            'email.unique'               => 'This email address is already registered.',
            'email_otp_token.required'   => 'Please verify your email address with the OTP.',
            'mobile_otp_token.required'  => 'Please verify your mobile number with the OTP.',
            'password.confirmed'         => 'Password and Confirm Password must match.',
            'terms.accepted'             => 'Please accept the Terms & Conditions.',
            'privacy.accepted'           => 'Please accept the Privacy Policy.',
        ]);

        $clean = fn (?string $v) => $v === null ? null : preg_replace('/\s+/', ' ', trim($v));

        if ($type === 'group') {
            $groupName = $clean($data['group_name']);
            // No second active account for the same group name.
            $taken = User::where('role_id', 6)->where('active', 1)
                    ->whereRaw('LOWER(account_name) = ?', [mb_strtolower($groupName)])->exists()
                || DB::table('artist_group_details')->whereRaw('LOWER(group_name) = ?', [mb_strtolower($groupName)])->exists();
            if ($taken) {
                return $this->error('A group with this name is already registered.', 422, 'validation_error', [
                    'group_name' => ['A group with this name is already registered.'],
                ]);
            }
        }

        // Single use: spend the verified-OTP tokens only after everything else passed.
        if ($otpOn && !RegistrationController::consumeToken('email', $data['email_otp_token'] ?? null, $data['email'])) {
            return $this->error('Your email verification has expired. Please verify the email again.', 422, 'validation_error', [
                'email_otp' => ['Your email verification has expired. Please verify the email again.'],
            ]);
        }
        if ($mobileOtpOn && !RegistrationController::consumeToken('mobile', $data['mobile_otp_token'] ?? null, $data['mobile'])) {
            return $this->error('Your mobile verification has expired. Please verify the mobile number again.', 422, 'validation_error', [
                'mobile_otp' => ['Your mobile verification has expired. Please verify the mobile number again.'],
            ]);
        }

        $first = $clean($data['first_name']);
        $last = $clean($data['last_name']);

        $user = DB::transaction(function () use ($data, $type, $first, $last, $clean, $otpOn, $mobileOtpOn) {
            $user = new User();
            $user->forceFill([
                'role_id'             => self::ACCOUNT_TYPE_ROLES[$type],
                'firstname'           => $first,
                'lastname'            => $last,
                'full_name'           => trim("$first $last"),
                'account_name'        => match ($type) {
                    'group'                   => $clean($data['group_name']),
                    'organisation', 'partner' => $clean($data['organisation_name']),
                    default                   => null,
                },
                'organisation_type'   => match ($type) {
                    'organisation' => $data['organisation_type'],
                    'partner'      => $data['partner_type'],
                    default        => null,
                },
                'designation'         => in_array($type, ['organisation', 'partner'], true) ? $clean($data['designation'] ?? null) : null,
                'address'             => $type === 'partner' ? $clean($data['address'] ?? null) : null,
                'email'               => $data['email'],
                'mobile'              => $data['mobile'],
                'password'            => Hash::make($data['password']),
                'email_verified_at'   => $otpOn ? now() : null,
                'mobile_verified_at'  => $mobileOtpOn ? now() : null,
                'terms_accepted_at'   => now(),
                'privacy_accepted_at' => now(),
                'policy_version'      => (string) config('app.policy_version'),
                // Basic self-registration: the user can log in straight away and
                // completes the detailed profile from the dashboard.
                'active'              => 1,
                'verified_status'     => 1,
            ])->save();

            $user->forceFill(['regno' => generateRegistrationNumber($user->id, self::ACCOUNT_TYPE_ROLES[$type])])->save();

            if ($type === 'partner') {
                // Engagement Partners get their own profile record (never an
                // artist_institution_details row): completed after login.
                EngagementPartnerProfile::query()->create([
                    'user_id'           => $user->id,
                    'organisation_name' => $clean($data['organisation_name']),
                    'partner_type'      => $data['partner_type'],
                    'contact_person'    => trim("$first $last"),
                    'designation'       => $clean($data['designation'] ?? null) ?: null,
                    'address'           => $clean($data['address'] ?? null) ?: null,
                    'official_email'    => $data['email'],
                    'contact_number'    => $data['mobile'],
                ]);
            }

            return $user;
        });

        return $this->success(
            ['user' => $this->userPayload($user->load('role'))],
            'Your Opportunity Hub account has been created successfully.',
            201
        );
    }

    public function me(Request $request): JsonResponse
    {
        return $this->success(['user' => $this->userPayload($request->user()->loadMissing('role'))]);
    }

    /**
     * Swap a (possibly expired) token for a new one, as long as it is still
     * inside the refresh window (JWT_REFRESH_TTL). The old token is blacklisted.
     */
    public function refresh(): JsonResponse
    {
        $guard = auth('api');

        try {
            $token = $guard->refresh();
        } catch (TokenExpiredException) {
            return $this->error('Your session has expired. Please log in again.', 401, 'refresh_expired');
        } catch (JWTException) {
            return $this->error('Invalid authentication token.', 401, 'token_invalid');
        }

        $user = $guard->setToken($token)->user();
        if (!$user) {
            return $this->error('User no longer exists.', 401, 'token_invalid');
        }

        $user->load('role');
        if ($reason = $user->accountBlockReason()) {
            $guard->setToken($token)->invalidate(true);
            return $this->error($reason, 403, 'account_blocked');
        }

        return $this->tokenResponse($token, $user, 'Token refreshed.');
    }

    public function logout(Request $request): JsonResponse
    {
        $userId = $request->user()?->id;

        try {
            // forceForever: revoke immediately, ignoring JWT_BLACKLIST_GRACE_PERIOD
            // (the grace period is only meant for tokens replaced by /refresh).
            auth('api')->logout(true);
        } catch (JWTException) {
            // Already invalid - nothing to revoke.
        }

        if ($userId) {
            LoginHistory::where('user_id', $userId)
                ->whereNull('logged_out_at')
                ->latest('id')
                ->limit(1)
                ->update(['logged_out_at' => now()]);
        }

        return $this->success(null, 'Logged out successfully.');
    }

    // ---------------------------------------------------------------------

    private function tokenResponse(string $token, User $user, string $message): JsonResponse
    {
        $ttlMinutes = (int) config('jwt.ttl');

        return $this->success([
            'access_token' => $token,
            'token_type'   => 'bearer',
            'expires_in'   => $ttlMinutes * 60,               // seconds
            'refresh_ttl'  => (int) config('jwt.refresh_ttl') * 60, // seconds
            'user'         => $this->userPayload($user),
        ], $message);
    }

    /** The only user fields the frontend receives. */
    private function userPayload(User $user): array
    {
        $name = $user->full_name ?: trim(($user->firstname ?? '') . ' ' . ($user->lastname ?? ''));

        return [
            'id'        => $user->id,
            'regno'     => $user->regno,
            'name'      => $name,
            'email'     => $user->email,
            'mobile'    => $user->mobile,
            'role'      => [
                'id'   => (int) $user->role_id,
                'name' => $user->role?->name,
            ],
            'last_login_at' => optional($user->last_login_at)->toIso8601String(),
            // Artist accounts: until the profile is completed (or an update is
            // waiting for review) the Next.js artist console only opens My Profile.
            'profile_completed' => (bool) $user->profile_completed,
            'profile_pending'   => $this->profilePending($user),
        ];
    }

    /** Artist with an incomplete profile whose update request is waiting for review. */
    private function profilePending(User $user): bool
    {
        if ($user->profile_completed || ! in_array((int) $user->role_id, [5, 6, 7], true)) {
            return false;
        }

        return ArtistProfileRevision::query()
            ->where('user_id', $user->id)
            ->where('status', ArtistProfileRevision::STATUS_SUBMITTED)
            ->exists();
    }

    private function recordLogin(Request $request, User $user): void
    {
        try {
            $agent = new Agent();
            $agent->setUserAgent($request->userAgent());

            LoginHistory::create([
                'user_id'      => $user->id,
                'regno'        => $user->regno,
                'ip_address'   => $request->ip(),
                'user_agent'   => $request->userAgent(),
                'device'       => $agent->device(),
                'browser'      => $agent->browser(),
                'platform'     => $agent->platform(),
                'is_success'   => true,
                'logged_in_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::error('Login history error: ' . $e->getMessage());
        }
    }
}
