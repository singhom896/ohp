<?php

namespace App\Http\Controllers\Api\V1\Partner;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Api\V1\PublicPagesController;
use App\Http\Controllers\Controller;
use App\Models\BookingMatch;
use App\Services\ArtistProfileService;
use App\Services\BookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Engagement Partner: Search Artists (module /find-artists) and Shortlisted
 * Artists (module /shortlist).
 *
 *   GET    /partner/artists                 search approved artists, groups, organisations / institutes
 *   GET    /partner/artists/{id}            profile + my shortlist / engagements with the artist
 *   GET    /partner/shortlist               my shortlist
 *   POST   /partner/shortlist               { artist_id, note }
 *   DELETE /partner/shortlist/{artistId}
 *
 * Contact details (mobile, email) are shown only once the artist has accepted
 * one of the partner's requests / said they are interested, or is booked.
 */
class ArtistSearchController extends Controller
{
    use ApiResponse, ConsoleScope, PartnerScope;

    private const TYPES = ['individual' => 5, 'group' => 6, 'organisation' => 7];

    public function __construct(private readonly BookingService $bookings) {}

    public function index(Request $request): JsonResponse
    {
        $partner = $this->partner($request);
        $f = $request->validate([
            'search'       => ['nullable', 'string', 'max:100'],
            'type'         => ['nullable', Rule::in(array_keys(self::TYPES))],
            'art_form'     => ['nullable', 'integer'],
            'sub_art_form' => ['nullable', 'integer'],
            'state_id'     => ['nullable', 'integer'],
            'district_id'  => ['nullable', 'integer'],
            'location'     => ['nullable', 'string', 'max:100'],
            'accreditation' => ['nullable', Rule::in(['accredited', 'all'])],
            'page'         => ['nullable', 'integer', 'min:1'],
        ]);
        $csv = fn (string $col, int $id) => ["(',' || REPLACE(COALESCE({$col}, ''), ' ', '') || ',') LIKE ?", ["%,{$id},%"]];

        $q = DB::table('users as u')
            ->leftJoin('artist_registrations as ar', fn ($j) => $j->on('ar.user_id', '=', 'u.id')->where('u.role_id', 5))
            ->leftJoin('artist_group_details as ag', fn ($j) => $j->on('ag.user_id', '=', 'u.id')->where('u.role_id', 6))
            ->leftJoin('artist_institution_details as ai', fn ($j) => $j->on('ai.user_id', '=', 'u.id')->where('u.role_id', 7))
            ->whereIn('u.role_id', array_values(self::TYPES))
            ->where('u.active', 1)
            // Accredited = registration approved; "all" also lists profiles still under review.
            ->when(($f['accreditation'] ?? 'accredited') === 'accredited', fn ($w) => $w->where('u.verified_status', 1), fn ($w) => $w->whereIn('u.verified_status', [0, 1]))
            ->where(fn ($w) => $w->whereNotNull('ar.id')->orWhereNotNull('ag.id')->orWhereNotNull('ai.id'))
            ->when($f['type'] ?? null, fn ($w, $t) => $w->where('u.role_id', self::TYPES[$t]))
            ->when($f['state_id'] ?? null, fn ($w, $v) => $w->where('u.state', $v))
            ->when($f['district_id'] ?? null, fn ($w, $v) => $w->where('u.district', $v))
            ->when($f['location'] ?? null, fn ($w, $s) => $w->where('u.city', 'ilike', "%{$s}%"))
            ->when($f['search'] ?? null, fn ($w, $s) => $w->where(fn ($x) => $x
                ->where('u.full_name', 'ilike', "%{$s}%")->orWhere('ar.stage_name', 'ilike', "%{$s}%")
                ->orWhere('ag.group_name', 'ilike', "%{$s}%")->orWhere('ai.institution_name', 'ilike', "%{$s}%")
                ->orWhere('u.regno', 'ilike', "%{$s}%")))
            ->when($f['art_form'] ?? null, function ($w, $id) use ($csv) {
                [$s1, $b1] = $csv('ag.art_form_id', (int) $id);
                [$s2, $b2] = $csv('ai.art_form_id', (int) $id);
                $w->where(fn ($x) => $x->where('ar.art_form_id', $id)->orWhere('ag.primary_art_form_id', $id)->orWhereRaw($s1, $b1)->orWhereRaw($s2, $b2));
            })
            ->when($f['sub_art_form'] ?? null, fn ($w, $id) => $w->where('ar.subgenre_id', $id));

        $page = $q->orderBy('u.id', 'desc')->select('u.id')->paginate(12, ['*'], 'page', (int) ($f['page'] ?? 1));
        $ids = collect($page->items())->pluck('id')->all();
        $info = $this->bookings->artistInfo($ids);
        $shortlisted = DB::table('partner_shortlists')->where('partner_id', $partner->id)->whereIn('artist_id', $ids)->pluck('artist_id')->flip();

        return $this->success([
            'items' => collect($ids)->map(fn ($id) => $this->card($info[$id] ?? null) + ['shortlisted' => isset($shortlisted[$id])])->filter(fn ($a) => isset($a['id']))->values(),
            'meta' => self::pageMeta($page),
            'options' => $this->filterOptions(),
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $partner = $this->partner($request);
        $info = $this->bookings->artistInfo([$id])[$id] ?? null;
        abort_unless($info && in_array($info['role_id'], self::TYPES, true), 404, 'Artist not found.');
        abort_unless((int) DB::table('users')->where('id', $id)->value('active') === 1, 404, 'Artist not found.');

        // Public profile (bio, facts, languages, portfolio links, awards): same rules as the public site.
        try {
            $public = app(PublicPagesController::class)->artist($id)->getData(true)['data']['item'] ?? [];
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException) {
            $public = []; // profile still under review: not on the public site yet
        }

        $engagements = BookingMatch::query()->join('booking_requirements as r', 'r.id', '=', 'booking_matches.requirement_id')
            ->where('r.organisation_id', $partner->id)->where('booking_matches.artist_id', $id)
            ->orderByDesc('r.event_date')->get(['booking_matches.*', 'r.title', 'r.reference', 'r.event_date', 'r.id as rid']);
        $contactOk = $engagements->contains(fn ($m) => $m->interest === 'interested' || $m->booking_status !== null);
        $short = DB::table('partner_shortlists')->where('partner_id', $partner->id)->where('artist_id', $id)->first();
        $ratings = DB::table('booking_matches')->where('artist_id', $id)->whereNotNull('rating');

        return $this->success([
            'artist' => $this->card($info, $contactOk) + [
                'about' => $public['about'] ?? null, 'facts' => $public['facts'] ?? [], 'languages' => $public['languages'] ?? [],
                'links' => $public['links'] ?? [], 'awards' => $public['awards'] ?? [],
                'completed_performances' => DB::table('booking_matches')->where('artist_id', $id)->where('booking_status', 'completed')->count(),
                'average_rating' => ($avg = (clone $ratings)->avg('rating')) ? round((float) $avg, 1) : null,
                'ratings' => (clone $ratings)->count(),
            ],
            'shortlisted' => (bool) $short, 'shortlist_note' => $short->note ?? null,
            'engagements' => $engagements->map(fn ($m) => [
                'requirement_id' => $m->rid, 'title' => $m->title, 'reference' => $m->reference,
                'event_date' => substr((string) $m->event_date, 0, 10),
            ] + $this->bookings->matchState($m))->values(),
        ]);
    }

    // ---- Shortlist ---------------------------------------------------------

    public function shortlist(Request $request): JsonResponse
    {
        $partner = $this->partner($request);
        $rows = DB::table('partner_shortlists')->where('partner_id', $partner->id)->orderByDesc('id')->get();
        $info = $this->bookings->artistInfo($rows->pluck('artist_id')->all());

        return $this->success([
            'items' => $rows->filter(fn ($s) => isset($info[$s->artist_id]))->map(fn ($s) => $this->card($info[$s->artist_id]) + [
                'note' => $s->note, 'shortlisted_at' => $s->created_at,
            ])->values(),
        ]);
    }

    public function addToShortlist(Request $request): JsonResponse
    {
        $partner = $this->partner($request);
        $data = $request->validate(['artist_id' => ['required', 'integer'], 'note' => ['nullable', 'string', 'max:500']]);
        $ok = DB::table('users')->where('id', $data['artist_id'])->whereIn('role_id', self::TYPES)->where('active', 1)->exists();
        abort_unless($ok, 404, 'Artist not found.');
        DB::table('partner_shortlists')->updateOrInsert(
            ['partner_id' => $partner->id, 'artist_id' => $data['artist_id']],
            ['note' => $data['note'] ?? null, 'updated_at' => now(), 'created_at' => now()],
        );

        return $this->success(['shortlisted' => true], 'Artist added to your shortlist.');
    }

    public function removeFromShortlist(Request $request, int $artistId): JsonResponse
    {
        $partner = $this->partner($request);
        DB::table('partner_shortlists')->where('partner_id', $partner->id)->where('artist_id', $artistId)->delete();

        return $this->success(['shortlisted' => false], 'Artist removed from your shortlist.');
    }

    // ------------------------------------------------------------------------

    /** Card for lists; contact details only when $withContact. */
    private function card(?array $a, bool $withContact = false): array
    {
        if (! $a) {
            return [];
        }
        $out = collect($a)->only(['id', 'name', 'type', 'regno', 'location', 'art_forms', 'photo', 'accredited'])->all();
        $out['type_key'] = array_search($a['role_id'], self::TYPES, true) ?: 'individual';
        if ($withContact) {
            $out['email'] = $a['email'];
            $out['mobile'] = $a['mobile'];
        }

        return $out;
    }

    private function filterOptions(): array
    {
        $artForms = DB::table('art_forms')->where('country_id', ArtistProfileService::INDIA)->where('status', 1)->orderBy('name')->get(['id', 'parent_id', 'name']);

        return [
            'art_forms' => $artForms->where('parent_id', 0)->values(),
            'sub_art_forms' => $artForms->where('parent_id', '>', 0)->values(),
            'states' => DB::table('states')->orderBy('StateName')->get(['id', 'StateName as name']),
            'districts' => DB::table('districts as d')->join('states as s', 's.StateCode', '=', 'd.StateCode')
                ->orderBy('d.DistrictName')->get(['d.id', 's.id as state_id', 'd.DistrictName as name']),
            'types' => [
                ['value' => 'individual', 'label' => 'Individual Artists'],
                ['value' => 'group', 'label' => 'Artist Groups'],
                ['value' => 'organisation', 'label' => 'Organisations / Institutes'],
            ],
        ];
    }
}
