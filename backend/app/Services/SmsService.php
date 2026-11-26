<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Sends SMS through the driver set in backend/.env (config/otp.php -> sms):
 *
 *   SMS_DRIVER=log    Writes the message to storage/logs/laravel.log
 *                     (development; nothing reaches the phone).
 *   SMS_DRIVER=http   Calls an HTTP SMS gateway (NIC, MSG91, ...):
 *                     SMS_HTTP_URL with {mobile} and {message} placeholders,
 *                     e.g. https://gateway.example/send?to=91{mobile}&text={message}&key=XXXX
 *                     SMS_HTTP_METHOD=GET|POST (POST sends the same values as form fields
 *                     mobile + message).
 */
class SmsService
{
    public function send(string $mobile, string $message): bool
    {
        $driver = (string) config('otp.sms.driver', 'log');

        if ($driver === 'log') {
            Log::info('SMS (log driver)', ['mobile' => $mobile, 'message' => $message]);
            return true;
        }

        if ($driver === 'http') {
            $url = (string) config('otp.sms.http_url');
            if ($url === '') {
                Log::error('SMS not sent: SMS_HTTP_URL is empty.');
                return false;
            }

            try {
                $method = strtoupper((string) config('otp.sms.http_method', 'GET'));
                $response = $method === 'POST'
                    ? Http::timeout(15)->asForm()->post($url, ['mobile' => $mobile, 'message' => $message])
                    : Http::timeout(15)->get(strtr($url, [
                        '{mobile}'  => rawurlencode($mobile),
                        '{message}' => rawurlencode($message),
                    ]));

                if (!$response->successful()) {
                    Log::error('SMS gateway error', ['status' => $response->status(), 'body' => mb_substr($response->body(), 0, 500)]);
                }

                return $response->successful();
            } catch (\Throwable $e) {
                Log::error('SMS sending failed', ['error' => $e->getMessage()]);
                return false;
            }
        }

        Log::error("SMS not sent: unknown SMS_DRIVER '{$driver}'.");
        return false;
    }
}
