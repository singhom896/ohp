<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\BookingRequirement as Requirement;
use App\Models\EngagementPartnerProfile as Profile;
use App\Services\BookingService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Engagement Partner management for administrators (module /engagement-partners:
 * Super Admin / Admin full, ZCC view). Partner accounts are kept apart from
 * artist accounts (role 11, engagement_partner_profiles).
 *
 *   GET   /engagement-partners             list (search, type, state, status, verified) + counts
 *   GET   /engagement-partners/{id}        profile, account, opportunities, booking figures
 *   PATCH /engagement-partners/{id}/status { active: bool, reason }   activate / suspend the account
 *   PATCH /engagement-partners/{id}/verify { verified: bool }         "Verified partner" badge
 */
class EngagementPartnerController extends Controller
{
    use ApiResponse, ConsoleScope;

    public function __construct(private readonly BookingService $bookings, private readonly NotificationService $notifications) {}

    public function index(Request $request): JsonResponse
    {
        $f = $request->validate([
            'search'   => ['nullable', 'string', 'max:100'],
            'type'     => ['nullable', Rule::in(Profile::TYPES)],
            'state_id' => ['nullable', 'integer'],
            'status'   => ['nullable', Rule::in(['active', 'suspended', 'verified', 'unverified', 'incomplete'])],
            'page'     => ['nullable', 'integer', 'min:1'],
        ]);
        $base = DB::table('users as u')->join('engagement_partner_profiles as p', 'p.user_id', '=', 'u.id')
            ->where('u.role_id', Profile::ROLE)
            ->when($f['type'] ?? null, fn ($q, $t) => $q->where('p.partner_type', $t))
            ->when($f['state_id'] ?? null, fn ($q, $s) => $q->where('p.state_id', $s))
            ->when($f['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('p.organisation_name', 'ilike', "%{$s}%")
                ->orWhere('p.contact_person', 'ilike', "%{$s}%")->orWhere('u.email', 'ilike', "%{$s}%")
                ->orWhere('u.mobile', 'ilike', "%{$s}%")->orWhere('u.regno', 'ilike', "%{$s}%")));
        $counts = [
            'all' => (clone $base)->count(),
            'active' => (clone $base)->where('u.active', 1)->count(),
            'suspended' => (clone $base)->where('u.active', '!=', 1)->count(),
            'verified' => (clone $base)->whereNotNull('p.verified_at')->count(),
            'incomplete' => (clone $base)->whereNull('p.completed_at')->count(),
        ];
        $q = (clone $base)->when($f['status'] ?? null, fn ($q, $s) => match ($s) {
            'active' => $q->where('u.active', 1),
            'suspended' => $q->where('u.active', '!=', 1),
            'verified' => $q->whereNotNull('p.verified_at'),
            'unverified' => $q->whereNull('p.verified_at'),
            'incomplete' => $q->whereNull('p.completed_at'),
        });
        $page = $q->leftJoin('states as s', 's.id', '=', 'p.state_id')->orderByDesc('u.id')
            ->paginate(20, ['u.id', 'u.regno', 'u.email', 'u.mobile', 'u.active', 'u.created_at', 'p.organisation_name', 'p.partner_type',
                'p.contact_person', 'p.city', 's.StateName as state', 'p.completed_at', 'p.verified_at'], 'page', (int) ($f['page'] ?? 1));
        $ids = collect($page->items())->pluck('id');
        $opps = Requirement::query()->whereIn('organisation_id', $ids)->where('status', '!=', 'draft')
            ->select('organisation_id', DB::raw('COUNT(*) as c'))->groupBy('organisation_id')->pluck('c', 'organisation_id');

        return $this->success([
            'items' => collect($page->items())->map(fn ($p) => [
                'id' => $p->id, 'regno' => $p->regno, 'organisation' => $p->organisation_name, 'type' => $p->partner_type,
                'contact_person' => $p->contact_person, 'email' => $p->email, 'mobile' => $p->mobile,
                'location' => collect([$p->city, $p->state])->filter()->implode(', '), 'active' => (int) $p->active === 1,
                'complete' => $p->completed_at !== null, 'verified' => $p->verified_at !== null,
                'opportunities' => (int) ($opps[$p->id] ?? 0), 'registered_at' => $p->created_at,
            ])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'from' => $page->firstItem(), 'to' => $page->lastItem()],
            'counts' => $counts,
            'options' => ['types' => Profile::TYPES, 'states' => DB::table('states')->orderBy('StateName')->get(['id', 'StateName as name'])],
            'can_edit' => $this->can('/engagement-partners', 'edit'),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $u = DB::table('users')->where('id', $id)->where('role_id', Profile::ROLE)->first();
        abort_unless($u, 404, 'Engagement Partner not found.');
        $p = Profile::query()->where('user_id', $id)->firstOrFail();
        $reqs = Requirement::query()->where('organisation_id', $id)->where('status', '!=', 'draft')->orderByDesc('event_date')->limit(100)->get();
        $m = DB::table('booking_matches as m')->join('booking_requirements as r', 'r.id', '=', 'm.requirement_id')->where('r.organisation_id', $id)->where('r.status', '!=', 'draft');

        return $this->success([
            'account' => ['id' => $u->id, 'regno' => $u->regno, 'email' => $u->email, 'mobile' => $u->mobile, 'active' => (int) $u->active === 1,
                'registered_at' => $u->created_at, 'last_login_at' => $u->last_login_at],
            'profile' => [
                'organisation_name' => $p->organisation_name, 'partner_type' => $p->partner_type, 'contact_person' => $p->contact_person,
                'designation' => $p->designation, 'description' => $p->description, 'address' => $p->address,
                'state' => DB::table('states')->where('id', $p->state_id)->value('StateName'),
                'district' => DB::table('districts')->where('id', $p->district_id)->value('DistrictName'),
                'city' => $p->city, 'pincode' => $p->pincode, 'official_email' => $p->official_email, 'contact_number' => $p->contact_number,
                'website' => $p->website, 'logo' => $this->uploadUrl($p->logo_path), 'document' => $this->uploadUrl($p->document_path),
                'document_name' => $p->document_name, 'completion' => $p->completion(), 'complete' => $p->completed_at !== null,
                'verified' => $p->verified_at !== null, 'verified_at' => optional($p->verified_at)->toIso8601String(),
            ],
            'stats' => [
                'opportunities' => $reqs->count(),
                'artists_reached' => (clone $m)->distinct()->count('m.artist_id'),
                'requests_sent' => (clone $m)->whereNotNull('m.invited_at')->count(),
                'bookings' => (clone $m)->whereIn('m.booking_status', ['confirmed', 'completed'])->count(),
                'completed' => (clone $m)->where('m.booking_status', 'completed')->count(),
            ],
            'opportunities' => $reqs->map(fn ($r) => $this->bookings->present($r))->values(),
            'can_edit' => $this->can('/engagement-partners', 'edit'),
        ]);
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'active' => ['required', 'boolean'],
            'reason' => ['nullable', 'string', 'max:500', Rule::requiredIf(fn () => ! $request->boolean('active'))],
        ], ['reason.required' => 'Please give the reason for suspending the account.']);
        $updated = DB::table('users')->where('id', $id)->where('role_id', Profile::ROLE)->update(['active' => $data['active'] ? 1 : 0, 'updated_by' => $request->user()->id, 'updated_at' => now()]);
        abort_unless($updated, 404, 'Engagement Partner not found.');
        $this->notifications->notify($id, $data['active'] ? 'Your account has been activated' : 'Your account has been suspended', $data['reason'] ?? null);

        return $this->success(['active' => (bool) $data['active']], $data['active'] ? 'Account activated.' : 'Account suspended. The partner can no longer sign in.');
    }

    public function verify(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['verified' => ['required', 'boolean']]);
        $p = Profile::query()->where('user_id', $id)->firstOrFail();
        if ($data['verified'] && ! $p->completed_at) {
            return $this->error('The partner has not completed the organisation profile yet.', 422, 'profile_incomplete');
        }
        $p->update(['verified_at' => $data['verified'] ? now() : null, 'verified_by' => $data['verified'] ? $request->user()->id : null]);
        if ($data['verified']) {
            $this->notifications->notify($id, 'Your organisation is now a Verified Engagement Partner', 'Artists see the verified badge on your opportunities.');
        }

        return $this->success(['verified' => (bool) $data['verified']], $data['verified'] ? 'Partner marked as verified.' : 'Verification removed.');
    }
}
