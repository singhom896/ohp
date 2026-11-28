<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Mail\EmailOtpMail;
use App\Services\EmailOtpService;
use App\Services\SmsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Public helpers for the Next.js registration form (no login, no session).
 *
 *   GET  /registration/options                organisation types, policy version, OTP switches
 *   POST /registration/otp/{channel}/send     { email } | { mobile }        -> OTP sent
 *   POST /registration/otp/{channel}/verify   { email|mobile, otp }         -> { otp_token }
 *        channel = email | mobile
 *
 * Each channel is switched on/off in backend/.env (config/otp.php). Same limits
 * as the Blade registration: 6 digits, 10 min, 60 s resend cooldown, 5 attempts.
 * The API has no session, so a verified OTP is exchanged for a single-use
 * `otp_token` (30 min) that AuthController::register redeems via consumeToken().
 */
class RegistrationController extends Controller
{
    use ApiResponse;

    /**
     * Organisation / Institute types (Artist / Group registration). Hotels,
     * event organisers and corporates register as Engagement Partners
     * (EngagementPartnerProfile::TYPES); existing records keep their value.
     */
    public const ORGANISATION_TYPES = [
        'School',
        'College / University',
        'Central Government Ministry / Department',
        'State Government Department / Office',
        'Other Government Institution',
        'Other Private Organisation / Institution',
        'Cultural Institution',
    ];

    private const PURPOSE = EmailOtpService::PURPOSE_REGISTRATION;
    private const OTP_MINUTES = 10;
    private const RESEND_SECONDS = 60;
    private const MAX_ATTEMPTS = 5;
    private const TOKEN_MINUTES = 30;

    /** channel => [table, identifier column, config switch] */
    private const CHANNELS = [
        'email'  => ['email_otps', 'email', 'otp.email_enabled'],
        'mobile' => ['mobile_otps', 'mobile', 'otp.mobile_enabled'],
    ];

    public function options(): JsonResponse
    {
        return $this->success([
            'organisation_types' => self::ORGANISATION_TYPES,
            'partner_types'      => \App\Models\EngagementPartnerProfile::TYPES,
            // Location (same lists as My Profile / Organisation Profile).
            'states'             => DB::table('states')->orderBy('StateName')->get(['id', 'StateName as name']),
            'districts'          => DB::table('districts as d')->join('states as s', 's.StateCode', '=', 'd.StateCode')
                ->orderBy('d.DistrictName')->get(['d.id', 's.id as state_id', 'd.DistrictName as name']),
            'policy_version'     => (string) config('app.policy_version'),
            'email_otp_enabled'  => self::enabled('email'),
            'mobile_otp_enabled' => self::enabled('mobile'),
            'otp_minutes'        => self::OTP_MINUTES,
            'resend_seconds'     => self::RESEND_SECONDS,
        ]);
    }

    public static function enabled(string $channel): bool
    {
        return (bool) config(self::CHANNELS[$channel][2]);
    }

    public function sendOtp(Request $request, string $channel): JsonResponse
    {
        [$table, $column] = $this->channel($channel);

        $value = $this->validateIdentifier($request, $channel, true);

        $existing = DB::table($table)->where($column, $value)->where('purpose', self::PURPOSE)->first();
        if ($existing && $existing->last_sent_at) {
            $passed = Carbon::parse($existing->last_sent_at)->diffInSeconds(now());
            if ($passed < self::RESEND_SECONDS) {
                $wait = (int) ceil(self::RESEND_SECONDS - $passed);
                return $this->error("Please wait {$wait} seconds before requesting another OTP.", 429, 'otp_cooldown', ['retry_after' => [$wait]]);
            }
        }

        $otp = (string) random_int(100000, 999999);
        DB::table($table)->updateOrInsert(
            [$column => $value, 'purpose' => self::PURPOSE],
            [
                'otp_hash'     => Hash::make($otp),
                'attempts'     => 0,
                'expires_at'   => now()->addMinutes(self::OTP_MINUTES),
                'last_sent_at' => now(),
                'verified_at'  => null,
                'created_at'   => $existing->created_at ?? now(),
                'updated_at'   => now(),
            ]
        );

        $sent = $channel === 'email' ? $this->mail($value, $otp) : $this->sms($value, $otp);

        $payload = ['expires_in' => self::OTP_MINUTES * 60, 'resend_after' => self::RESEND_SECONDS];

        // Local development only: return the code so the form can be tested
        // without a mailbox / SMS gateway (as the Blade flow does today).
        if (app()->isLocal()) {
            $payload['debug_otp'] = $otp;
        } elseif (!$sent) {
            DB::table($table)->where($column, $value)->where('purpose', self::PURPOSE)->delete();
            return $this->error('Unable to send the OTP right now. Please try again later.', 503, 'otp_send_failed');
        }

        $where = $channel === 'email' ? 'email address' : 'mobile number';

        return $this->success($payload, "OTP has been sent to your {$where}.");
    }

    public function verifyOtp(Request $request, string $channel): JsonResponse
    {
        [$table, $column] = $this->channel($channel);

        $value = $this->validateIdentifier($request, $channel, false);
        $data = $request->validate(['otp' => ['required', 'digits:6']], [
            'otp.required' => 'Please enter the 6-digit OTP.',
            'otp.digits'   => 'The OTP must be 6 digits.',
        ]);

        $record = DB::table($table)->where($column, $value)->where('purpose', self::PURPOSE)->first();
        $fail = fn (string $m, int $status = 422) => $this->error($m, $status, 'otp_invalid', ['otp' => [$m]]);

        if (!$record) {
            return $fail('OTP not found. Please request a new OTP.');
        }
        if (Carbon::parse($record->expires_at)->isPast()) {
            DB::table($table)->where('id', $record->id)->delete();
            return $fail('OTP has expired. Please request a new OTP.');
        }
        if ((int) $record->attempts >= self::MAX_ATTEMPTS) {
            return $fail('Maximum OTP attempts reached. Please request a new OTP.', 429);
        }
        if (!Hash::check($data['otp'], $record->otp_hash)) {
            $attempts = (int) $record->attempts + 1;
            DB::table($table)->where('id', $record->id)->update(['attempts' => $attempts, 'updated_at' => now()]);
            return $fail('Invalid OTP. ' . max(0, self::MAX_ATTEMPTS - $attempts) . ' attempt(s) remaining.');
        }

        DB::table($table)->where('id', $record->id)->update(['verified_at' => now(), 'updated_at' => now()]);

        $token = Str::random(64);
        Cache::put(self::cacheKey($channel, $token), $value, now()->addMinutes(self::TOKEN_MINUTES));

        $what = $channel === 'email' ? 'Email' : 'Mobile number';

        return $this->success(['otp_token' => $token, $column => $value], "{$what} verified successfully.");
    }

    /** True once for a valid token issued for this email / mobile; the token is then spent. */
    public static function consumeToken(string $channel, ?string $token, string $value): bool
    {
        if (!$token || !isset(self::CHANNELS[$channel])) {
            return false;
        }
        [$table, $column] = self::CHANNELS[$channel];
        $value = $channel === 'email' ? Str::lower(trim($value)) : trim($value);
        $key = self::cacheKey($channel, $token);
        if (Cache::get($key) !== $value) {
            return false;
        }
        Cache::forget($key);
        DB::table($table)->where($column, $value)->where('purpose', self::PURPOSE)->delete();

        return true;
    }

    // ---------------------------------------------------------------------

    /** @return array{0: string, 1: string} table + identifier column */
    private function channel(string $channel): array
    {
        abort_unless(isset(self::CHANNELS[$channel]), 404, 'Unknown OTP channel.');
        abort_unless(self::enabled($channel), 404, ucfirst($channel) . ' OTP verification is switched off.');

        return self::CHANNELS[$channel];
    }

    /** Validates and normalises the email / mobile. New registrations only when sending. */
    private function validateIdentifier(Request $request, string $channel, bool $mustBeNew): string
    {
        if ($channel === 'email') {
            $data = $request->validate([
                'email' => array_filter(['required', 'email:rfc', 'max:255', $mustBeNew ? 'unique:users,email' : null]),
            ], [
                'email.required' => 'Please enter your email address.',
                'email.email'    => 'Please enter a valid email address.',
                'email.unique'   => 'This email address is already registered.',
            ]);

            return Str::lower(trim($data['email']));
        }

        $data = $request->validate([
            'mobile' => array_filter(['required', 'regex:/^[6-9][0-9]{9}$/', $mustBeNew ? 'unique:users,mobile' : null]),
        ], [
            'mobile.required' => 'Please enter your mobile number.',
            'mobile.regex'    => 'Please enter a valid 10-digit Indian mobile number.',
            'mobile.unique'   => 'This mobile number is already registered.',
        ]);

        return trim($data['mobile']);
    }

    private function mail(string $email, string $otp): bool
    {
        if (!config('mail_notifications.otp', true)) {
            return false;
        }
        try {
            Mail::to($email)->send(new EmailOtpMail($otp, self::PURPOSE, self::OTP_MINUTES));
            return true;
        } catch (\Throwable $e) {
            Log::error('Registration OTP email failed', ['email' => $email, 'error' => $e->getMessage()]);
            return false;
        }
    }

    private function sms(string $mobile, string $otp): bool
    {
        $message = strtr((string) config('otp.sms.template'), ['{otp}' => $otp, '{minutes}' => (string) self::OTP_MINUTES]);

        return app(SmsService::class)->send($mobile, $message);
    }

    private static function cacheKey(string $channel, string $token): string
    {
        return "reg-otp-token:{$channel}:" . hash('sha256', $token);
    }
}
