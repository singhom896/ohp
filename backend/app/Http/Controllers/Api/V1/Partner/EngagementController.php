<?php

namespace App\Http\Controllers\Api\V1\Partner;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\BookingMatch;
use App\Models\BookingRequirement as Requirement;
use App\Services\BookingService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Engagement Partner dashboard, engagement requests, bookings and reports.
 *
 *   GET /partner/dashboard          figures, upcoming bookings, latest responses, profile state
 *   GET /partner/engagements        engagement requests / responses across my opportunities (module /engagements)
 *   GET /partner/bookings           confirmed, completed, cancelled bookings (module /partner-bookings)
 *   GET /partner/reports            totals, by status, by art form, monthly trend (module /partner-reports)
 */
class EngagementController extends Controller
{
    use ApiResponse, PartnerScope;

    public function __construct(private readonly BookingService $bookings, private readonly NotificationService $notifications) {}

    public function dashboard(Request $request): JsonResponse
    {
        $partner = $this->partner($request);
        $profile = $this->profile($partner);
        $reqs = Requirement::query()->where('organisation_id', $partner->id);
        $matches = $this->matchBase($partner->id);

        $upcoming = (clone $matches)->where('booking_matches.booking_status', 'confirmed')->whereDate('r.event_date', '>=', now()->toDateString())
            ->orderBy('r.event_date')->limit(5)->get(['booking_matches.*', 'r.title', 'r.reference', 'r.event_date', 'r.venue', 'r.id as rid']);
        $responses = (clone $matches)->whereNotNull('booking_matches.responded_at')->orderByDesc('booking_matches.responded_at')->limit(6)
            ->get(['booking_matches.*', 'r.title', 'r.reference', 'r.event_date', 'r.id as rid']);
        $info = $this->bookings->artistInfo($upcoming->pluck('artist_id')->merge($responses->pluck('artist_id'))->unique()->all());
        $row = fn ($m) => [
            'requirement_id' => $m->rid, 'title' => $m->title, 'reference' => $m->reference, 'event_date' => substr((string) $m->event_date, 0, 10),
            'venue' => $m->venue ?? null, 'artist' => $info[$m->artist_id]['name'] ?? '—', 'artist_id' => $m->artist_id,
        ] + $this->bookings->matchState($m);

        return $this->success([
            'organisation' => $profile->organisation_name, 'partner_type' => $profile->partner_type,
            'profile' => ['completion' => $profile->completion(), 'complete' => $profile->completed_at !== null, 'verified' => $profile->verified_at !== null],
            'stats' => [
                'opportunities' => (clone $reqs)->where('status', '!=', 'draft')->count(),
                'live' => (clone $reqs)->whereIn('status', ['open', 'booked'])->whereDate('event_date', '>=', now()->toDateString())->count(),
                'drafts' => (clone $reqs)->where('status', 'draft')->count(),
                'requests_sent' => (clone $matches)->whereNotNull('booking_matches.invited_at')->count(),
                'awaiting' => (clone $matches)->whereNotNull('booking_matches.invited_at')->where('booking_matches.interest', 'pending')->whereNull('booking_matches.booking_status')->count(),
                'interested' => (clone $matches)->where('booking_matches.interest', 'interested')->count(),
                'confirmed' => (clone $matches)->where('booking_matches.booking_status', 'confirmed')->count(),
                'completed' => (clone $matches)->where('booking_matches.booking_status', 'completed')->count(),
                'shortlisted' => DB::table('partner_shortlists')->where('partner_id', $partner->id)->count(),
            ],
            'upcoming' => $upcoming->map($row)->values(),
            'responses' => $responses->map($row)->values(),
            'unread_notifications' => $this->notifications->unreadCount($partner->id),
        ]);
    }

    public function engagements(Request $request): JsonResponse
    {
        $partner = $this->partner($request);
        $f = $request->validate([
            'status' => ['nullable', Rule::in(['awaiting', 'accepted', 'declined', 'booked', 'all'])],
            'source' => ['nullable', Rule::in(['invited', 'matched', 'all'])],
            'requirement_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $base = $this->matchBase($partner->id)
            ->when(($f['source'] ?? 'invited') === 'invited', fn ($q) => $q->whereNotNull('booking_matches.invited_at'))
            ->when(($f['source'] ?? 'invited') === 'matched', fn ($q) => $q->whereNull('booking_matches.invited_at'))
            ->when($f['requirement_id'] ?? null, fn ($q, $id) => $q->where('r.id', $id))
            ->when($f['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('r.title', 'ilike', "%{$s}%")->orWhere('r.reference', 'ilike', "%{$s}%")));
        $filters = [
            'awaiting' => fn ($q) => $q->where('booking_matches.interest', 'pending')->whereNull('booking_matches.booking_status'),
            'accepted' => fn ($q) => $q->where('booking_matches.interest', 'interested')->whereNull('booking_matches.booking_status'),
            'declined' => fn ($q) => $q->where('booking_matches.interest', 'not_available'),
            'booked'   => fn ($q) => $q->whereNotNull('booking_matches.booking_status'),
        ];
        $counts = collect($filters)->map(fn ($fn) => $fn(clone $base)->count())->all() + ['all' => (clone $base)->count()];
        $status = $f['status'] ?? 'all';
        $q = $status !== 'all' ? $filters[$status](clone $base) : clone $base;
        $page = $q->orderByDesc(DB::raw('COALESCE(booking_matches.responded_at, booking_matches.invited_at, booking_matches.created_at)'))
            ->paginate(20, ['booking_matches.*', 'r.title', 'r.reference', 'r.event_date', 'r.status as req_status', 'r.id as rid'], 'page', (int) ($f['page'] ?? 1));
        $info = $this->bookings->artistInfo(collect($page->items())->pluck('artist_id')->unique()->all());

        return $this->success([
            'items' => collect($page->items())->map(fn ($m) => [
                'requirement_id' => $m->rid, 'title' => $m->title, 'reference' => $m->reference,
                'event_date' => substr((string) $m->event_date, 0, 10), 'requirement_status' => $m->req_status,
                'artist' => $this->artistCard($info[$m->artist_id] ?? null, $m),
            ] + $this->bookings->matchState($m))->values(),
            'meta' => self::pageMeta($page),
            'counts' => $counts,
            'opportunities' => Requirement::query()->where('organisation_id', $partner->id)->where('status', '!=', 'draft')
                ->orderByDesc('event_date')->get(['id', 'title', 'reference']),
        ]);
    }

    public function bookings(Request $request): JsonResponse
    {
        $partner = $this->partner($request);
        $f = $request->validate([
            'status' => ['nullable', Rule::in(['confirmed', 'completed', 'cancelled', 'all'])],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $base = $this->matchBase($partner->id)->whereNotNull('booking_matches.booking_status');
        $counts = (clone $base)->select('booking_matches.booking_status', DB::raw('COUNT(*) as c'))->groupBy('booking_matches.booking_status')->pluck('c', 'booking_status');
        $status = $f['status'] ?? 'all';
        $page = (clone $base)->when($status !== 'all', fn ($q) => $q->where('booking_matches.booking_status', $status))
            ->orderByDesc('r.event_date')
            ->paginate(20, ['booking_matches.*', 'r.title', 'r.reference', 'r.event_date', 'r.venue', 'r.city', 'r.id as rid'], 'page', (int) ($f['page'] ?? 1));
        $info = $this->bookings->artistInfo(collect($page->items())->pluck('artist_id')->unique()->all());
        $media = DB::table('booking_media')->whereIn('requirement_id', collect($page->items())->pluck('rid')->unique())
            ->select('requirement_id', DB::raw('COUNT(*) as c'))->groupBy('requirement_id')->pluck('c', 'requirement_id');

        return $this->success([
            'items' => collect($page->items())->map(fn ($m) => [
                'requirement_id' => $m->rid, 'title' => $m->title, 'reference' => $m->reference,
                'event_date' => substr((string) $m->event_date, 0, 10), 'venue' => collect([$m->venue, $m->city])->filter()->implode(', '),
                'artist' => $this->artistCard($info[$m->artist_id] ?? null, $m), 'media_count' => (int) ($media[$m->rid] ?? 0),
            ] + $this->bookings->matchState($m))->values(),
            'meta' => self::pageMeta($page),
            'counts' => ['confirmed' => (int) ($counts['confirmed'] ?? 0), 'completed' => (int) ($counts['completed'] ?? 0),
                'cancelled' => (int) ($counts['cancelled'] ?? 0), 'all' => (int) $counts->sum()],
        ]);
    }

    public function reports(Request $request): JsonResponse
    {
        $partner = $this->partner($request);
        $reqs = Requirement::query()->where('booking_requirements.organisation_id', $partner->id)->where('booking_requirements.status', '!=', 'draft');
        $matches = $this->matchBase($partner->id);
        $monthExpr = "to_char(r.event_date, 'YYYY-MM')";
        $from = now()->startOfMonth()->subMonths(11)->toDateString();

        $byMonth = (clone $matches)->whereNotNull('booking_matches.booking_status')->where('booking_matches.booking_status', '!=', 'cancelled')
            ->whereDate('r.event_date', '>=', $from)
            ->selectRaw("{$monthExpr} as m, COUNT(*) as c")->groupBy(DB::raw($monthExpr))->pluck('c', 'm');
        $months = collect(range(11, 0))->map(fn ($i) => now()->startOfMonth()->subMonths($i)->format('Y-m'));

        return $this->success([
            'totals' => [
                'opportunities' => (clone $reqs)->count(),
                'artists_reached' => (clone $matches)->distinct()->count('booking_matches.artist_id'),
                'requests_sent' => (clone $matches)->whereNotNull('booking_matches.invited_at')->count(),
                'accepted' => (clone $matches)->where('booking_matches.interest', 'interested')->count(),
                'declined' => (clone $matches)->where('booking_matches.interest', 'not_available')->count(),
                'bookings' => (clone $matches)->whereIn('booking_matches.booking_status', ['confirmed', 'completed'])->count(),
                'completed' => (clone $matches)->where('booking_matches.booking_status', 'completed')->count(),
                'cancelled' => (clone $matches)->where('booking_matches.booking_status', 'cancelled')->count(),
                'average_rating' => ($a = (clone $matches)->avg('booking_matches.rating')) ? round((float) $a, 1) : null,
            ],
            'by_status' => (clone $reqs)->select('booking_requirements.status', DB::raw('COUNT(*) as c'))->groupBy('booking_requirements.status')->pluck('c', 'status'),
            'by_art_form' => (clone $reqs)->leftJoin('art_forms as a', 'a.id', '=', 'booking_requirements.art_form_id')
                ->select('a.name', DB::raw('COUNT(*) as c'))->groupBy('a.name')->orderByDesc('c')->get(),
            'by_category' => (clone $reqs)->select('programme_type as name', DB::raw('COUNT(*) as c'))->groupBy('programme_type')->orderByDesc('c')->get(),
            'trend' => $months->map(fn ($m) => ['month' => $m, 'bookings' => (int) ($byMonth[$m] ?? 0)])->values(),
            'opportunities' => (clone $reqs)->orderByDesc('event_date')->limit(500)->get()->map(fn ($r) => $this->bookings->present($r))->values(),
        ]);
    }

    // ------------------------------------------------------------------

    private function matchBase(int $partnerId)
    {
        return BookingMatch::query()->join('booking_requirements as r', 'r.id', '=', 'booking_matches.requirement_id')
            ->where('r.organisation_id', $partnerId)->where('r.status', '!=', 'draft');
    }

    /** Artist summary; contact details once the artist has accepted / is booked. */
    private function artistCard(?array $a, BookingMatch $m): ?array
    {
        if (! $a) {
            return null;
        }
        $card = collect($a)->only(['id', 'name', 'type', 'regno', 'location', 'art_forms', 'photo'])->all();
        if ($m->interest === 'interested' || $m->booking_status !== null) {
            $card += ['email' => $a['email'], 'mobile' => $a['mobile']];
        }

        return $card;
    }
}
