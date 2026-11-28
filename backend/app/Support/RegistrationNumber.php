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
 * Zonal Cultural Centre accounts (role 8): OH-ZCC- + the user's primary key,
 * 5 digits (users.id 123 -> OH-ZCC-00123). Unique because the id is; assigned
 * after the user row is saved (forUser()).
 *
 * Other staff accounts (Admin, Ministry ...) keep their own numbering.
 */
final class RegistrationNumber
{
    public const SEQUENCE = 'registration_number_seq';

    /** users.role_id => prefix code (artist / partner global sequence) */
    public const PREFIXES = [5 => 'AI', 6 => 'AG', 7 => 'AO', 11 => 'EP'];

    /** Zonal Cultural Centre accounts: OH-ZCC-<users.id, 5 digits> */
    public const ZCC_ROLE = 8;

    /** ID for a saved user: OH-ZCC-<id> for ZCC accounts, else the next OH- ID of the role (null if none). */
    public static function forUser(int $userId, int $roleId): ?string
    {
        return $roleId === self::ZCC_ROLE ? self::formatZcc($userId) : self::next($roleId);
    }

    /** Next ID for an account of this role, or null when the role has no OH- ID (ZCC: use forUser()). */
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

    public static function formatZcc(int $userId): string
    {
        return sprintf('OH-ZCC-%05d', $userId);
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
