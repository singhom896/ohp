<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\BookingRequirement as Requirement;
use App\Services\BookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Booking Management (Admins: full; ZCC Nodal Officers: view).
 *
 *   GET  /bookings                 all published requirements (filters) + counts + totals
 *   GET  /bookings/confirmed       all recorded bookings (filters)
 *   GET  /bookings/{id}            requirement, organisation, matched artists
 *   POST /bookings/{id}/status     { action: close|cancel|reopen, reason }  (edit permission)
 */
class BookingController extends Controller
{
    use ApiResponse, ConsoleScope;

    public function __construct(private readonly BookingService $bookings) {}

    public function index(Request $request): JsonResponse
    {
        $f = $this->filters($request, ['status' => ['nullable', Rule::in(['open', 'booked', 'closed', 'cancelled'])]]);
        $base = $this->requirements($f);
        $counts = (clone $base)->select('r.status', DB::raw('COUNT(*) as total'))->groupBy('r.status')->pluck('total', 'status');
        $page = (clone $base)->when($f['status'] ?? null, fn ($q, $s) => $q->where('r.status', $s))
            ->orderByDesc('r.published_at')->select('r.id')
            ->paginate(20, ['*'], 'page', (int) ($f['page'] ?? 1));
        $reqs = Requirement::query()->whereIn('id', collect($page->items())->pluck('id'))->get()->keyBy('id');

        $totals = DB::table('booking_matches as m')->join('booking_requirements as r', 'r.id', '=', 'm.requirement_id')
            ->where('r.status', '!=', 'draft')
            ->selectRaw("COUNT(*) as notified, SUM(CASE WHEN m.interest = 'interested' THEN 1 ELSE 0 END) as interested")
            ->selectRaw("SUM(CASE WHEN m.booking_status IN ('confirmed', 'completed') THEN 1 ELSE 0 END) as booked")
            ->first();

        return $this->success([
            'items'  => collect($page->items())->map(fn ($row) => $this->bookings->present($reqs[$row->id]))->values(),
            'meta'   => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'from' => $page->firstItem(), 'to' => $page->lastItem()],
            'counts' => ['open' => (int) ($counts['open'] ?? 0), 'booked' => (int) ($counts['booked'] ?? 0), 'closed' => (int) ($counts['closed'] ?? 0), 'cancelled' => (int) ($counts['cancelled'] ?? 0)],
            'totals' => ['requirements' => (int) $counts->sum(), 'artists_matched' => (int) ($totals->notified ?? 0), 'interested' => (int) ($totals->interested ?? 0), 'booked' => (int) ($totals->booked ?? 0)],
            'options' => $this->filterOptions(),
            'can_edit' => $this->can('/bookings', 'edit'),
        ]);
    }

    public function confirmed(Request $request): JsonResponse
    {
        $f = $this->filters($request, ['booking_status' => ['nullable', Rule::in(['confirmed', 'completed', 'cancelled'])]]);
        $q = $this->requirements($f)->join('booking_matches as m', 'm.requirement_id', '=', 'r.id')->whereNotNull('m.booking_status')
            ->when($f['booking_status'] ?? null, fn ($w, $s) => $w->where('m.booking_status', $s))
            ->orderByDesc('m.booked_at')
            ->select(['m.id as match_id', 'm.artist_id', 'm.booking_status', 'm.confirmed_via', 'm.confirmed_on', 'm.agreed_fee', 'm.booking_remarks', 'm.booked_at',
                'r.id', 'r.reference', 'r.title', 'r.event_date', 'r.organisation_id']);
        $page = $q->paginate(20, ['*'], 'page', (int) ($f['page'] ?? 1));
        $artists = $this->bookings->artistInfo(collect($page->items())->pluck('artist_id')->unique()->all());

        return $this->success([
            'items' => collect($page->items())->map(fn ($b) => [
                'match_id' => $b->match_id, 'requirement_id' => $b->id, 'reference' => $b->reference, 'title' => $b->title,
                'event_date' => substr((string) $b->event_date, 0, 10), 'organisation' => $this->bookings->organisationName($b->organisation_id),
                'artist' => $artists[$b->artist_id] ?? null, 'booking_status' => $b->booking_status,
                'confirmed_via' => $b->confirmed_via, 'confirmed_on' => $b->confirmed_on ? substr((string) $b->confirmed_on, 0, 10) : null,
                'agreed_fee' => $b->agreed_fee, 'remarks' => $b->booking_remarks, 'booked_at' => $b->booked_at,
            ])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'from' => $page->firstItem(), 'to' => $page->lastItem()],
            'options' => $this->filterOptions(),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $r = Requirement::query()->where('status', '!=', Requirement::STATUS_DRAFT)->findOrFail($id);
        $org = DB::table('users as u')->leftJoin('artist_institution_details as ai', 'ai.user_id', '=', 'u.id')
            ->leftJoin('engagement_partner_profiles as ep', 'ep.user_id', '=', 'u.id')
            ->where('u.id', $r->organisation_id)->first(['u.id', 'u.role_id', 'u.regno', 'u.email', 'u.mobile', 'u.full_name', 'ai.institution_name',
                'ai.institution_type', 'ep.organisation_name', 'ep.partner_type', 'ep.contact_person']);

        return $this->success([
            'requirement'  => $this->bookings->present($r),
            'organisation' => $org ? [
                'id' => $org->id, 'is_partner' => (int) $org->role_id === 11,
                'name' => $org->organisation_name ?: ($org->institution_name ?: $org->full_name), 'regno' => $org->regno,
                'category' => $org->partner_type ?: $org->institution_type,
                'contact_person' => $org->contact_person ?: $org->full_name, 'email' => $org->email, 'mobile' => $org->mobile,
            ] : null,
            'matches'      => $this->bookings->matchRows($r),
            'media'        => app(\App\Http\Controllers\Api\V1\Partner\RequirementController::class)->media($r),
            'can_edit'     => $this->can('/bookings', 'edit'),
        ]);
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $r = Requirement::query()->where('status', '!=', Requirement::STATUS_DRAFT)->findOrFail($id);
        $data = $request->validate([
            'action' => ['required', Rule::in(['close', 'cancel', 'reopen'])],
            'reason' => ['nullable', 'string', 'max:1000', Rule::requiredIf(fn () => $request->input('action') !== 'reopen')],
        ], ['reason.required' => 'Please give the reason; it is recorded on the requirement.']);
        $r = $this->bookings->changeStatus($r, $data['action'], $data['reason'] ?? null, $request->user());

        return $this->success($this->bookings->present($r), 'Requirement status updated.');
    }

    // ------------------------------------------------------------------

    private function filters(Request $request, array $extra): array
    {
        return $request->validate($extra + [
            'search'      => ['nullable', 'string', 'max:100'],
            'state_id'    => ['nullable', 'integer'],
            'art_form_id' => ['nullable', 'integer'],
            'date_from'   => ['nullable', 'date'],
            'date_to'     => ['nullable', 'date', 'after_or_equal:date_from'],
            'page'        => ['nullable', 'integer', 'min:1'],
        ]);
    }

    /** Published requirements with the common filters (search covers title, reference, organisation). */
    private function requirements(array $f)
    {
        return DB::table('booking_requirements as r')
            ->leftJoin('artist_institution_details as ai', 'ai.user_id', '=', 'r.organisation_id')
            ->leftJoin('engagement_partner_profiles as ep', 'ep.user_id', '=', 'r.organisation_id')
            ->where('r.status', '!=', Requirement::STATUS_DRAFT)
            ->when($f['state_id'] ?? null, fn ($q, $s) => $q->where('r.state_id', $s))
            ->when($f['art_form_id'] ?? null, fn ($q, $a) => $q->where('r.art_form_id', $a))
            ->when($f['date_from'] ?? null, fn ($q, $d) => $q->whereDate('r.event_date', '>=', $d))
            ->when($f['date_to'] ?? null, fn ($q, $d) => $q->whereDate('r.event_date', '<=', $d))
            ->when($f['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('r.title', 'ilike', "%{$s}%")
                ->orWhere('r.reference', 'ilike', "%{$s}%")->orWhere('ai.institution_name', 'ilike', "%{$s}%")
                ->orWhere('ep.organisation_name', 'ilike', "%{$s}%")));
    }

    private function filterOptions(): array
    {
        $o = $this->bookings->options();

        return ['states' => $o['states'], 'art_forms' => $o['art_forms']];
    }
}
