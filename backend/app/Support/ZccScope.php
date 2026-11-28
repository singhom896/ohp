<?php

namespace App\Support;

use App\Models\User;
use App\Models\ZonalCulturalCentre;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Zone-based access for Zonal Cultural Centre officials (role 8).
 *
 * A ZCC official sees and manages only artists whose State / UT is a member
 * State of their ZCC (zcc_states). The artist's State is users.state
 * (states.id, from registration / My Profile); older admin-created or imported
 * records only have users.region_id (art_regions.id), used as the fallback.
 * States can belong to several ZCCs, so more than one ZCC may manage an artist.
 *
 * A ZCC account that is not linked to a ZCC (users.zcc_id null) sees no artists.
 * Every other role is unaffected by this class.
 */
final class ZccScope
{
    public const ROLE = 8;

    /** @var array<int, array{states: int[], regions: int[]}> */
    private static array $coverage = [];

    public static function isZcc(?User $user = null): bool
    {
        $user ??= Auth::user();

        return $user && (int) $user->role_id === self::ROLE;
    }

    public static function zccId(?User $user = null): ?int
    {
        $user ??= Auth::user();

        return $user && $user->zcc_id ? (int) $user->zcc_id : null;
    }

    public static function centre(?User $user = null): ?ZonalCulturalCentre
    {
        $id = self::zccId($user);

        return $id ? ZonalCulturalCentre::query()->find($id) : null;
    }

    /** Member state ids (states.id) and region ids (art_regions.id) of a ZCC. */
    public static function coverage(?int $zccId): array
    {
        if (! $zccId) {
            return ['states' => [], 'regions' => []];
        }

        return self::$coverage[$zccId] ??= (function () use ($zccId) {
            $rows = DB::table('zcc_states')->where('zcc_id', $zccId)->get(['state_id', 'region_id']);

            return [
                'states'  => $rows->pluck('state_id')->filter()->map(fn ($v) => (int) $v)->values()->all(),
                'regions' => $rows->pluck('region_id')->filter()->map(fn ($v) => (int) $v)->values()->all(),
            ];
        })();
    }

    /**
     * Limit an artist (users) query to the signed-in ZCC official's zone.
     * Works with Eloquent and query builders. No-op for other roles.
     *
     * @template T
     * @param  T  $query
     * @return T
     */
    public static function apply($query, string $alias = 'users', ?User $viewer = null)
    {
        $viewer ??= Auth::user();
        if (! self::isZcc($viewer)) {
            return $query;
        }

        $cov = self::coverage(self::zccId($viewer));
        if (! $cov['states'] && ! $cov['regions']) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where(function ($w) use ($alias, $cov) {
            $w->whereIn("{$alias}.state", $cov['states'] ?: [-1])
                ->orWhere(fn ($r) => $r->whereNull("{$alias}.state")->whereIn("{$alias}.region_id", $cov['regions'] ?: [-1]));
        });
    }

    /** May this viewer manage this artist? Always true for non-ZCC roles. */
    public static function canAccess(object $artist, ?User $viewer = null): bool
    {
        $viewer ??= Auth::user();
        if (! self::isZcc($viewer)) {
            return true;
        }

        return in_array(self::zccId($viewer), self::zccIdsFor($artist), true);
    }

    public static function authorize(object $artist, ?User $viewer = null): void
    {
        abort_unless(self::canAccess($artist, $viewer), 403, 'This artist is not in a State / UT of your Zonal Cultural Centre.');
    }

    /** ZCC ids whose member States include the artist's State / UT. */
    public static function zccIdsFor(object $artist): array
    {
        $state = $artist->state ?? null;
        $region = $artist->region_id ?? null;
        // A partially loaded model: read the location columns.
        if ($state === null && $region === null && isset($artist->id)) {
            $row = DB::table('users')->where('id', $artist->id)->first(['state', 'region_id']);
            [$state, $region] = [$row->state ?? null, $row->region_id ?? null];
        }

        $q = DB::table('zcc_states');
        if ($state) {
            $q->where('state_id', (int) $state);
        } elseif ($region) {
            $q->where('region_id', (int) $region);
        } else {
            return [];
        }

        return $q->distinct()->pluck('zcc_id')->map(fn ($v) => (int) $v)->all();
    }

    /** Active ZCC officials responsible for this artist (for review notifications). */
    public static function officialsFor(object $artist): Collection
    {
        $ids = self::zccIdsFor($artist);

        return $ids
            ? User::query()->where('role_id', self::ROLE)->where('active', 1)->whereIn('zcc_id', $ids)->get()
            : collect();
    }

    /** Matching art_regions.id for a states.id (same State / UT name). */
    public static function regionForState(?int $stateId): ?int
    {
        if (! $stateId) {
            return null;
        }
        $id = DB::table('zcc_states')->where('state_id', $stateId)->whereNotNull('region_id')->value('region_id');
        if ($id) {
            return (int) $id;
        }
        $name = DB::table('states')->where('id', $stateId)->value('StateName');

        return $name ? ((int) DB::table('art_regions')->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->value('id') ?: null) : null;
    }

    /** For tests / long-running workers. */
    public static function flush(): void
    {
        self::$coverage = [];
    }
}
