<?php

namespace App\Http\Controllers\Api\V1\Artist;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\V1\Partner\RequirementController as PartnerRequirements;
use App\Http\Controllers\Controller;
use App\Models\BookingMatch;
use App\Models\BookingRequirement as Requirement;
use App\Models\User;
use App\Services\BookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Opportunities for Artist / Group accounts: Individual Artists (5), Artist
 * Groups (6) and Organisations / Institutes (7). Each tab is its own console
 * module (sidebar entry):
 *
 *   tab open      Find Opportunities       live opportunities matched to my profile, not yet booked
 *   tab requests  Booking Requests         engagement requests from partners awaiting my reply
 *   tab bookings  Confirmed Performances   confirmed bookings
 *   tab saved     Saved Opportunities      opportunities I saved
 *   tab history   Engagement History       completed / cancelled bookings and past events
 *
 *   GET  /artist/opportunities?tab=…            (+ counts of every tab)
 *   GET  /artist/opportunities/{id}             opportunity (by id) + my response / booking / feedback
 *   POST /artist/opportunities/{id}/interest    { interest: interested|not_available, note }  (accept / decline)
 *   POST /artist/opportunities/{id}/save        { saved: bool }
 */
class OpportunityController extends Controller
{
    use ApiResponse;

    public const ROLES = [5, 6, 7];

    /** Tab => module page_url (the module that must be viewable for it). */
    public const TAB_MODULES = [
        'open' => '/opportunities', 'requests' => '/booking-requests', 'bookings' => '/performances',
        'saved' => '/saved-opportunities', 'history' => '/engagement-history', 'all' => '/opportunities',
    ];

    public function __construct(private readonly BookingService $bookings) {}

    public function index(Request $request): JsonResponse
    {
        $artist = $this->artist($request);
        $f = $request->validate(['tab' => ['nullable', Rule::in(array_keys(self::TAB_MODULES))], 'page' => ['nullable', 'integer', 'min:1']]);
        $tab = $f['tab'] ?? 'open';
        $today = now()->toDateString();

        $base = BookingMatch::query()->where('booking_matches.artist_id', $artist->id)
            ->join('booking_requirements as r', 'r.id', '=', 'booking_matches.requirement_id')
            ->where('r.status', '!=', Requirement::STATUS_DRAFT);
        $live = fn ($q) => $q->whereIn('r.status', [Requirement::STATUS_OPEN, Requirement::STATUS_BOOKED])->whereDate('r.event_date', '>=', $today);
        $tabs = [
            'open'     => fn ($q) => $live($q)->whereNull('booking_matches.booking_status'),
            'requests' => fn ($q) => $live($q)->whereNotNull('booking_matches.invited_at')->where('booking_matches.interest', 'pending')->whereNull('booking_matches.booking_status'),
            'bookings' => fn ($q) => $q->where('booking_matches.booking_status', 'confirmed'),
            'saved'    => fn ($q) => $q->whereNotNull('booking_matches.saved_at'),
            'history'  => fn ($q) => $q->where(fn ($w) => $w->whereIn('booking_matches.booking_status', ['completed', 'cancelled'])
                ->orWhere(fn ($x) => $x->whereNull('booking_matches.booking_status')->where(fn ($y) => $y->whereDate('r.event_date', '<', $today)
                    ->orWhereIn('r.status', [Requirement::STATUS_CLOSED, Requirement::STATUS_CANCELLED]))->where('booking_matches.interest', '!=', 'pending'))),
            'all'      => fn ($q) => $q,
        ];

        $counts = collect($tabs)->map(fn ($fn) => $fn(clone $base)->count())->all();
        $order = in_array($tab, ['open', 'requests', 'bookings', 'saved'], true) ? 'asc' : 'desc';
        $page = $tabs[$tab](clone $base)->select('booking_matches.*')->orderBy('r.event_date', $order)
            ->paginate(12, ['*'], 'page', (int) ($f['page'] ?? 1));
        $reqs = Requirement::query()->whereIn('id', collect($page->items())->pluck('requirement_id'))->get()->keyBy('id');

        return $this->success([
            'items' => collect($page->items())->map(fn (BookingMatch $m) => [
                'requirement' => $this->summary($reqs[$m->requirement_id]),
                'mine' => $this->bookings->matchState($m),
            ])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'from' => $page->firstItem(), 'to' => $page->lastItem()],
            'counts' => $counts,
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $m = $this->match($request, $id);
        $r = $m->requirement;
        $data = $this->bookings->present($r);
        unset($data['stats']);
        // The organiser's phone / email are on the opportunity so the artist can call back.

        return $this->success([
            'requirement' => $data,
            'mine' => $this->bookings->matchState($m),
            'media' => in_array($m->booking_status, ['confirmed', 'completed'], true) ? app(PartnerRequirements::class)->media($r) : [],
            'can_respond' => $r->isLive() && ! in_array($m->booking_status, ['confirmed', 'completed'], true),
        ]);
    }

    public function interest(Request $request, int $id): JsonResponse
    {
        $m = $this->match($request, $id);
        $data = $request->validate([
            'interest' => ['required', Rule::in(['interested', 'not_available'])],
            'note'     => ['nullable', 'string', 'max:1000'],
        ]);
        $m = $this->bookings->respond($m, $data['interest'], $data['note'] ?? null);
        $invited = $m->isInvited();

        return $this->success($this->bookings->matchState($m->fresh()), match (true) {
            $data['interest'] === 'interested' && $invited => 'Request accepted. The organiser has been informed and will confirm the booking with you by phone or email.',
            $data['interest'] === 'interested' => 'Thank you. The organiser has been told that you are interested and will contact you by phone or email.',
            $invited => 'Request declined. The organiser has been informed.',
            default => 'Your response has been saved.',
        });
    }

    public function save(Request $request, int $id): JsonResponse
    {
        $m = $this->match($request, $id);
        $saved = $request->boolean('saved');
        $m->update(['saved_at' => $saved ? now() : null]);

        return $this->success($this->bookings->matchState($m->fresh()), $saved ? 'Opportunity saved.' : 'Removed from saved opportunities.');
    }

    private function artist(Request $request): User
    {
        $user = $request->user();
        abort_unless($user && in_array((int) $user->role_id, self::ROLES, true), 403, 'Opportunities are available to Artist / Group accounts only.');

        return $user;
    }

    private function match(Request $request, int $requirementId): BookingMatch
    {
        return BookingMatch::query()->with('requirement')->where('artist_id', $this->artist($request)->id)
            ->where('requirement_id', $requirementId)
            ->whereHas('requirement', fn ($q) => $q->where('status', '!=', Requirement::STATUS_DRAFT))
            ->firstOrFail();
    }

    private function summary(Requirement $r): array
    {
        $p = $this->bookings->partnerInfo($r->organisation_id);

        return [
            'id' => $r->id, 'reference' => $r->reference, 'title' => $r->title, 'status' => $r->status,
            'status_label' => Requirement::STATUS_LABELS[$r->status] ?? $r->status, 'live' => $r->isLive(),
            'organisation' => $p['name'], 'organisation_type' => $p['type'], 'organisation_verified' => $p['verified'],
            'event_date' => optional($r->event_date)->toDateString(), 'event_end_date' => optional($r->event_end_date)->toDateString(),
            'event_time' => $r->event_time, 'end_time' => $r->end_time, 'venue' => $r->venue, 'city' => $r->city, 'budget' => $r->budget,
            'respond_by' => optional($r->respond_by)->toDateString(), 'programme_type' => $r->programme_type,
        ];
    }
}
