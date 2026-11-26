<?php

return [
    // Set any value to false to disable that email without changing controller code.
    'otp' => env('MAIL_NOTIFY_OTP', true),
    'registration_confirmation' => env('MAIL_NOTIFY_REGISTRATION_CONFIRMATION', true),
    'nodal_registration' => env('MAIL_NOTIFY_NODAL_REGISTRATION', true),
    'password_setup' => env('MAIL_NOTIFY_PASSWORD_SETUP', true),

    // Artist Application (profile update requests)
    'artist_approval' => env('MAIL_NOTIFY_ARTIST_APPROVAL', true),
    'artist_rejection' => env('MAIL_NOTIFY_ARTIST_REJECTION', true),
    'artist_profile_submission' => env('MAIL_NOTIFY_ARTIST_PROFILE_SUBMISSION', true),
    'zcc_profile_action' => env('MAIL_NOTIFY_ZCC_PROFILE_ACTION', true),

    // Newsletter
    'newsletter_verification' => env('MAIL_NOTIFY_NEWSLETTER_VERIFICATION', true),
    'newsletter_confirmation' => env('MAIL_NOTIFY_NEWSLETTER_CONFIRMATION', true),
    'newsletter_event' => env('MAIL_NOTIFY_NEWSLETTER_EVENT', true),

    // Booking System
    'booking_match' => env('MAIL_NOTIFY_BOOKING_MATCH', true),        // requirement published -> matching artists
    'booking_interest' => env('MAIL_NOTIFY_BOOKING_INTEREST', true),  // artist interested -> organisation
    'booking_status' => env('MAIL_NOTIFY_BOOKING_STATUS', true),      // booking confirmed / cancelled -> artist
];
