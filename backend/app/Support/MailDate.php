<?php

namespace App\Support;

use DateTimeInterface;
use Illuminate\Support\Carbon;
use Throwable;

/**
 * Consistent date/time formatting for email templates, e.g. "14 November 2026, 10:30 AM IST".
 * Always converted to the application timezone (config app.timezone); null/invalid values yield null.
 */
final class MailDate
{
    public static function format(mixed $value, bool $withTime = true): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        try {
            $date = $value instanceof DateTimeInterface ? Carbon::instance($value) : Carbon::parse((string) $value);
        } catch (Throwable) {
            // Already-formatted legacy strings are shown as given rather than dropped.
            return is_string($value) ? $value : null;
        }

        $date = $date->copy()->setTimezone(config('app.timezone', 'UTC'));

        return $withTime ? $date->format('j F Y, h:i A T') : $date->format('j F Y');
    }
}
