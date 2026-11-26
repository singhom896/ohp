<?php

/*
|--------------------------------------------------------------------------
| OTP switches (whole application)
|--------------------------------------------------------------------------
| Turn OTP verification on or off everywhere from backend/.env, then run
|   D:\xampp\php\php.exe artisan config:clear
|
|   OTP_EMAIL_ENABLED=true|false   Email OTP on registration
|   OTP_MOBILE_ENABLED=true|false  Mobile (SMS) OTP on registration
|
| true  = the OTP must be verified before the form can be submitted.
| false = the OTP step is hidden and the form goes ahead without it.
|
| Applies to the Next.js /register page (it reads these flags from
| GET /api/v1/registration/options - no frontend change or rebuild needed)
| and, for email, to the Laravel /artist-registration Blade form.
|
| SMS delivery for the mobile OTP: see App\Services\SmsService.
*/

return [
    'email_enabled'  => (bool) env('OTP_EMAIL_ENABLED', true),
    'mobile_enabled' => (bool) env('OTP_MOBILE_ENABLED', true),

    'sms' => [
        'driver'      => env('SMS_DRIVER', 'log'),     // log | http
        'http_url'    => env('SMS_HTTP_URL', ''),      // {mobile} and {message} are replaced
        'http_method' => env('SMS_HTTP_METHOD', 'GET'),
        'template'    => env('SMS_OTP_TEMPLATE', 'Your Opportunity Hub verification OTP is {otp}. It is valid for {minutes} minutes. Do not share it with anyone.'),
    ],
];
