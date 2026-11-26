<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\EngagementPartnerProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * Reports & MIS for the Ministry / Akademis / ZCCs (module /reports).
 *
 *   GET /reports/overview
 *     totals             registered / accredited / under review / not approved artists, partners, opportunities, bookings
 *     by_type            Individual / Group / Organisation with status split
 *     by_art_form        artists per top-level art form (individual primary category; groups and institutes list several)
 *     by_state           artists per State / UT
 *     by_region          artists per region (ZCC zone)
 *     partners_by_type   Engagement Partners per type
 *     opportunities      by status, by event category
 *     trend              last 12 months: registrations, opportunities posted, bookings
 */
class ReportController extends Controller
{
    use ApiResponse;

    private const TYPES = [5 => 'Individual Artist', 6 => 'Artist Group', 7 => 'Organisation / Institute'];

    public function overview(): JsonResponse
    {
        $artists = DB::table('users')->whereIn('role_id', array_keys(self::TYPES));
        $status = (clone $artists)->select('role_id', 'verified_status', DB::raw('COUNT(*) as c'))->groupBy('role_id', 'verified_status')->get();
        $sum = fn (?int $role, ?int $st) => (int) $status->filter(fn ($r) => ($role === null || (int) $r->role_id === $role) && ($st === null || (int) $r->verified_status === $st))->sum('c');
        $matches = DB::table('booking_matches as m')->join('booking_requirements as r', 'r.id', '=', 'm.requirement_id')->where('r.status', '!=', 'draft');

        return $this->success([
            'totals' => [
                'registered' => $sum(null, null),
                'accredited' => $sum(null, 1),
                'under_review' => $sum(null, 0),
                'not_approved' => $sum(null, 2),
                'partners' => DB::table('users')->where('role_id', EngagementPartnerProfile::ROLE)->count(),
                'verified_partners' => DB::table('engagement_partner_profiles')->whereNotNull('verified_at')->count(),
                'opportunities' => DB::table('booking_requirements')->where('status', '!=', 'draft')->count(),
                'live_opportunities' => DB::table('booking_requirements')->whereIn('status', ['open', 'booked'])->whereDate('event_date', '>=', now()->toDateString())->count(),
                'engagement_requests' => (clone $matches)->whereNotNull('m.invited_at')->count(),
                'responses_interested' => (clone $matches)->where('m.interest', 'interested')->count(),
                'bookings' => (clone $matches)->whereIn('m.booking_status', ['confirmed', 'completed'])->count(),
                'completed' => (clone $matches)->where('m.booking_status', 'completed')->count(),
            ],
            'by_type' => collect(self::TYPES)->map(fn ($label, $role) => [
                'type' => $label, 'total' => $sum($role, null), 'accredited' => $sum($role, 1),
                'under_review' => $sum($role, 0), 'not_approved' => $sum($role, 2),
            ])->values(),
            'by_art_form' => $this->byArtForm(),
            'by_state' => (clone $artists)->leftJoin('states as s', 's.id', '=', 'users.state')
                ->select(DB::raw("COALESCE(s.\"StateName\", 'Not given') as name"), DB::raw('COUNT(*) as total'),
                    DB::raw('SUM(CASE WHEN users.verified_status = 1 THEN 1 ELSE 0 END) as accredited'))
                ->groupBy(DB::raw("COALESCE(s.\"StateName\", 'Not given')"))->orderByDesc('total')->get(),
            'by_region' => (clone $artists)->leftJoin('art_regions as g', 'g.id', '=', 'users.region_id')
                ->select(DB::raw("COALESCE(g.name, 'Not given') as name"), DB::raw('COUNT(*) as total'),
                    DB::raw('SUM(CASE WHEN users.verified_status = 1 THEN 1 ELSE 0 END) as accredited'))
                ->groupBy(DB::raw("COALESCE(g.name, 'Not given')"))->orderByDesc('total')->get(),
            'partners_by_type' => DB::table('engagement_partner_profiles')->select('partner_type as name', DB::raw('COUNT(*) as total'))
                ->groupBy('partner_type')->orderByDesc('total')->get(),
            'opportunities' => [
                'by_status' => DB::table('booking_requirements')->select('status as name', DB::raw('COUNT(*) as total'))->groupBy('status')->get(),
                'by_category' => DB::table('booking_requirements')->where('status', '!=', 'draft')
                    ->select(DB::raw("COALESCE(programme_type, 'Not given') as name"), DB::raw('COUNT(*) as total'))
                    ->groupBy(DB::raw("COALESCE(programme_type, 'Not given')"))->orderByDesc('total')->get(),
            ],
            'trend' => $this->trend(),
        ]);
    }

    /** Artists per top-level art form; an artist listing several art forms counts once per art form. */
    private function byArtForm(): array
    {
        $names = DB::table('art_forms')->where('parent_id', 0)->pluck('name', 'id');
        $parent = DB::table('art_forms')->pluck('parent_id', 'id');
        $top = fn (int $id) => ($parent[$id] ?? 0) ? (int) $parent[$id] : $id;
        $counts = [];
        $add = function (int $userId, array $ids, bool $accredited) use (&$counts, $top, $names) {
            foreach (array_unique(array_map($top, array_filter($ids))) as $id) {
                if (! isset($names[$id])) {
                    continue;
                }
                $counts[$id]['total'] = ($counts[$id]['total'] ?? 0) + 1;
                $counts[$id]['accredited'] = ($counts[$id]['accredited'] ?? 0) + ($accredited ? 1 : 0);
            }
        };
        $csv = fn ($v) => array_map('intval', array_filter(explode(',', str_replace(' ', '', (string) $v))));

        DB::table('users as u')->join('artist_registrations as ar', 'ar.user_id', '=', 'u.id')->where('u.role_id', 5)
            ->get(['u.id', 'u.verified_status', 'ar.art_form_id'])->each(fn ($r) => $add($r->id, [(int) $r->art_form_id], (int) $r->verified_status === 1));
        DB::table('users as u')->join('artist_group_details as ag', 'ag.user_id', '=', 'u.id')->where('u.role_id', 6)
            ->get(['u.id', 'u.verified_status', 'ag.art_form_id', 'ag.primary_art_form_id'])
            ->each(fn ($r) => $add($r->id, array_merge($csv($r->art_form_id), [(int) $r->primary_art_form_id]), (int) $r->verified_status === 1));
        DB::table('users as u')->join('artist_institution_details as ai', 'ai.user_id', '=', 'u.id')->where('u.role_id', 7)
            ->get(['u.id', 'u.verified_status', 'ai.art_form_id'])->each(fn ($r) => $add($r->id, $csv($r->art_form_id), (int) $r->verified_status === 1));

        return collect($counts)->map(fn ($c, $id) => ['name' => $names[$id], 'total' => $c['total'], 'accredited' => $c['accredited']])
            ->sortByDesc('total')->values()->all();
    }

    private function trend(): array
    {
        $from = now()->startOfMonth()->subMonths(11);
        $month = fn (string $col) => "to_char({$col}, 'YYYY-MM')";
        $reg = DB::table('users')->whereIn('role_id', array_keys(self::TYPES))->where('created_at', '>=', $from)
            ->selectRaw($month('created_at').' as m, COUNT(*) as c')->groupBy(DB::raw($month('created_at')))->pluck('c', 'm');
        $opp = DB::table('booking_requirements')->whereNotNull('published_at')->where('published_at', '>=', $from)
            ->selectRaw($month('published_at').' as m, COUNT(*) as c')->groupBy(DB::raw($month('published_at')))->pluck('c', 'm');
        $book = DB::table('booking_matches')->whereNotNull('booked_at')->where('booked_at', '>=', $from)
            ->selectRaw($month('booked_at').' as m, COUNT(*) as c')->groupBy(DB::raw($month('booked_at')))->pluck('c', 'm');

        return collect(range(11, 0))->map(function ($i) use ($reg, $opp, $book) {
            $m = now()->startOfMonth()->subMonths($i)->format('Y-m');

            return ['month' => $m, 'registrations' => (int) ($reg[$m] ?? 0), 'opportunities' => (int) ($opp[$m] ?? 0), 'bookings' => (int) ($book[$m] ?? 0)];
        })->values()->all();
    }
}
