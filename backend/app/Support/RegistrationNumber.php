<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Registration IDs for self-registered accounts, one global sequence for all
 * four types (PostgreSQL sequence `registration_number_seq`, so two parallel
 * registrations can never get the same number):
 *
 *   Individual Artist         OH-AI-00001
 *   Artist Group              OH-AG-00002
 *   Organisation / Institute  OH-AO-00003
 *   Engagement Partner        OH-EP-00004
 *
 * Staff accounts (Admin, Ministry, ZCC ...) keep their own numbering.
 */
final class RegistrationNumber
{
    public const SEQUENCE = 'registration_number_seq';

    /** users.role_id => prefix code */
    public const PREFIXES = [5 => 'AI', 6 => 'AG', 7 => 'AO', 11 => 'EP'];

    /** Next ID for an account of this role, or null when the role has no OH- ID. */
    public static function next(int $roleId): ?string
    {
        if (! isset(self::PREFIXES[$roleId])) {
            return null;
        }
        $n = (int) DB::selectOne('SELECT nextval(?) AS n', [self::SEQUENCE])->n;

        return self::format($roleId, $n);
    }

    public static function format(int $roleId, int $number): string
    {
        return sprintf('OH-%s-%05d', self::PREFIXES[$roleId], $number);
    }

    /** Role for the type names / letters used by the older registration code. */
    public static function roleForType(string $type): int
    {
        return match (strtolower($type)) {
            'individual', 'artist', 'a', '5' => 5,
            'group', 'g', '6' => 6,
            'partner', 'engagement_partner', 'ep', '11' => 11,
            default => 7, // organisation / institution / 'i'
        };
    }
}
