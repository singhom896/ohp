<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\Country;
use App\Models\Module;
use App\Models\User;
use App\Support\ZccScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * Logged-in user's console: sidebar, dashboard, profile and password.
 *
 *   GET  /console/menu             sidebar tree + per-module permissions
 *   GET  /console/dashboard        dashboard stats + "Your modules"
 *   GET  /console/profile          profile form data
 *   PUT  /console/profile          update own profile
 *   PUT  /console/password         change own password
 */
class ConsoleController extends Controller
{
    use ApiResponse, ConsoleScope;

    /**
     * Sidebar tree for the Next.js console: active top-level
     * modules the role can view, with their viewable children. Also returns a
     * flat page_url -> permissions map the frontend uses to show/hide buttons.
     */
    public function menu(Request $request): JsonResponse
    {
        return $this->success($this->menuData($request->user()));
    }

    private function menuData(User $user): array
    {
        $user->loadMissing('role');

        $rows = DB::table('permissions as p')
            ->join('modules as m', 'm.module_id', '=', 'p.module_id')
            ->where('p.role_id', $user->role->id)
            ->where('m.active', 1)
            ->get(['m.module_id', 'm.page_url', 'p.can_view', 'p.can_create', 'p.can_edit', 'p.can_delete']);

        $permissions = [];
        $viewable = [];
        foreach ($rows as $row) {
            if ((int) $row->can_view === 1) {
                $viewable[] = (int) $row->module_id;
            }
            if (!$row->page_url || $row->page_url === '#') {
                continue;
            }
            // Several modules can share a page_url; keep the most permissive.
            $current = $permissions[$row->page_url] ?? ['view' => false, 'create' => false, 'edit' => false, 'delete' => false];
            $permissions[$row->page_url] = [
                'view'   => $current['view'] || (int) $row->can_view === 1,
                'create' => $current['create'] || (int) $row->can_create === 1,
                'edit'   => $current['edit'] || (int) $row->can_edit === 1,
                'delete' => $current['delete'] || (int) $row->can_delete === 1,
            ];
        }

        $modules = Module::query()
            ->whereNull('parent_id')
            ->where('active', 1)
            ->whereIn('module_id', $viewable)
            ->orderBy('position')
            ->with(['children' => fn ($q) => $q->whereIn('module_id', $viewable)])
            ->get();

        $map = function (Module $m) use (&$map) {
            return [
                'id'       => (int) $m->module_id,
                'name'     => $m->module_name,
                'url'      => $m->page_url,
                'icon'     => trim(preg_replace('/^bi\s+/', '', (string) $m->icon_name)),
                'children' => $m->children->map($map)->values()->all(),
            ];
        };

        return [
            'menu'           => $modules->map($map)->values()->all(),
            'permissions'    => (object) $permissions,
            'is_super_admin' => (int) $user->role->id === 1,
        ];
    }

    public function dashboard(Request $request): JsonResponse
    {
        $user = $request->user();
        $isNodal = $this->isNodal();

        $country = null;
        if ($isNodal) {
            abort_if(!$user->country_id, 403, 'Your Nodal Agency account has no assigned country.');
            $country = Country::query()->findOrFail($user->country_id);
        }

        // ZCC officials: artists of their member States / UTs (not country-wide).
        $isZcc = ZccScope::isZcc($user);
        $artists = User::query()
            ->whereIn('role_id', [5, 6, 7])
            ->when($isZcc, fn ($q) => ZccScope::apply($q, 'users', $user))
            ->when($country && ! $isZcc, fn ($q) => $q->where('country_id', $country->id));

        // "Your modules": leaf modules of the sidebar, same as the Blade dashboard.
        $modules = collect($this->menuData($user)['menu'])
            ->flatMap(fn ($m) => empty($m['children']) ? [$m] : $m['children'])
            ->filter(fn ($m) => filled($m['url']) && $m['url'] !== '#')
            ->values();

        $isArtistRole = in_array($this->roleId(), [5, 6, 7], true);

        $base = [
            'agency_name'     => $user->full_name ?: ($user->firstname ?: 'User'),
            'role_name'       => $user->role?->name,
            'is_nodal_agency' => $isNodal,
            'is_admin_role'   => in_array($this->roleId(), [1, 2, 3, 4], true),
            'is_artist_role'  => $isArtistRole,
            'country'         => $country ? ['id' => $country->id, 'name' => $country->name] : null,
            'modules'         => $modules,
            'zcc'             => $isZcc ? $this->zccSummary($user) : null,
        ];

        // Artist and Engagement Partner accounts see only their own workspace,
        // never registry-wide figures (only staff roles get the statistics).
        if (! in_array($this->roleId(), [1, 2, 3, 4, 8], true)) {
            return $this->success($base + ['stats' => null] + ($isArtistRole ? ['artist_summary' => $this->artistSummary($user)] : []));
        }

        $events = DB::table('events')->where('is_deleted', 0)
            ->when($country, fn ($q) => $q->where('country_id', $country->id));

        $monthStart = now()->startOfMonth();
        $prevStart = now()->subMonthNoOverflow()->startOfMonth();
        $change = function ($query, string $column = 'created_at') use ($monthStart, $prevStart): ?float {
            $now = (clone $query)->where($column, '>=', $monthStart)->count();
            $prev = (clone $query)->where($column, '>=', $prevStart)->where($column, '<', $monthStart)->count();

            return $prev > 0 ? round(($now - $prev) / $prev * 100, 1) : null;
        };

        $total = (clone $artists)->count();
        $byType = (clone $artists)->selectRaw('role_id, count(*) as c')->groupBy('role_id')->pluck('c', 'role_id');
        $approved = (clone $artists)->where('verified_status', 1)->count();

        return $this->success($base + [
            'stats' => [
                'total'           => $total,
                'pending'         => (clone $artists)->where('verified_status', 0)->count(),
                'approved'        => $approved,
                'rejected'        => (clone $artists)->where('verified_status', 2)->count(),
                'changes_requested' => (clone $artists)->where('verified_status', 3)->count(),
                'approval_rate'   => $total ? round($approved / $total * 100, 1) : null,
                'total_change'    => $change($artists),
                'events'          => (clone $events)->count(),
                'upcoming_events' => (clone $events)->where('event_date', '>=', now()->startOfDay())->count(),
                'events_change'   => $change($events),
            ],
            'by_type' => [
                'individual'  => (int) ($byType[5] ?? 0),
                'group'       => (int) ($byType[6] ?? 0),
                'institution' => (int) ($byType[7] ?? 0),
            ],
            'trend'           => $this->registrationTrend($artists),
            'recent_activity' => $this->recentActivity($isZcc ? null : $country?->id, $isZcc ? $user : null),
            'upcoming_events' => $this->can('/event', 'view') ? $this->upcomingEvents($events) : null,
        ]);
    }

    /** New artist accounts per month for the last 6 months, split by type. */
    private function registrationTrend($artists): array
    {
        $start = now()->subMonthsNoOverflow(5)->startOfMonth();
        $monthExpr = DB::getDriverName() === 'pgsql'
            ? "to_char(created_at, 'YYYY-MM')"
            : "DATE_FORMAT(created_at, '%Y-%m')";

        $rows = (clone $artists)->where('created_at', '>=', $start)
            ->selectRaw("{$monthExpr} as m, role_id, count(*) as c")
            ->groupBy(DB::raw($monthExpr), 'role_id')
            ->get();

        $out = [];
        for ($i = 0; $i < 6; $i++) {
            $key = $start->copy()->addMonthsNoOverflow($i)->format('Y-m');
            $pick = fn (int $role) => (int) ($rows->first(fn ($r) => $r->m === $key && (int) $r->role_id === $role)->c ?? 0);
            $row = ['month' => $key, 'individual' => $pick(5), 'group' => $pick(6), 'institution' => $pick(7)];
            $row['total'] = $row['individual'] + $row['group'] + $row['institution'];
            $out[] = $row;
        }

        return $out;
    }

    /** Latest approvals / rejections, new registrations and new events, newest first. */
    /** The signed-in official's ZCC, member States / UTs and review queue. */
    private function zccSummary(User $user): array
    {
        $zcc = ZccScope::centre($user);
        if (! $zcc) {
            return ['linked' => false];
        }

        $states = DB::table('zcc_states as z')->join('states as s', 's.id', '=', 'z.state_id')
            ->where('z.zcc_id', $zcc->id)->orderBy('s.StateName')->pluck('s.StateName');

        // Pending registrations that are ready for review (profile details submitted).
        $queue = ZccScope::apply(DB::table('users as u'), 'u', $user)
            ->whereIn('u.role_id', [5, 6, 7])->where('u.verified_status', 0)
            ->where(fn ($w) => $w->whereExists(fn ($q) => $q->from('artist_registrations')->whereColumn('user_id', 'u.id'))
                ->orWhereExists(fn ($q) => $q->from('artist_group_details')->whereColumn('user_id', 'u.id'))
                ->orWhereExists(fn ($q) => $q->from('artist_institution_details')->whereColumn('user_id', 'u.id')))
            ->count();

        $updates = ZccScope::apply(DB::table('artist_profile_revisions as r')->join('users as u', 'u.id', '=', 'r.user_id'), 'u', $user)
            ->where('r.status', 'submitted')->count();

        return [
            'linked'          => true,
            'code'            => $zcc->code,
            'name'            => $zcc->name,
            'headquarters'    => $zcc->headquarters,
            'contact_person'  => $zcc->contact_person,
            'states'          => $states,
            'pending_review'  => $queue,
            'pending_updates' => $updates,
        ];
    }

    private function recentActivity(?int $countryId, ?User $zccViewer = null): array
    {
        $types = [5 => 'Individual Artist', 6 => 'Artist Group', 7 => 'Organisation'];

        $decisions = DB::table('artist_status_histories as h')
            ->join('users as u', 'u.id', '=', 'h.user_id')
            ->leftJoin('users as by', 'by.id', '=', 'h.created_by')
            ->when($countryId, fn ($q) => $q->where('u.country_id', $countryId))
            ->when($zccViewer, fn ($q) => ZccScope::apply($q, 'u', $zccViewer))
            ->whereIn('h.new_status', [1, 2])
            ->orderByDesc('h.created_at')->limit(6)
            ->get(['h.new_status', 'h.created_at', 'u.full_name', 'u.regno', 'by.full_name as by_name'])
            ->map(fn ($r) => [
                'kind'  => (int) $r->new_status === 1 ? 'approved' : 'rejected',
                'title' => (int) $r->new_status === 1 ? 'Artist profile approved' : 'Artist registration rejected',
                'name'  => trim($r->full_name . ($r->regno ? " ({$r->regno})" : '')),
                'meta'  => $r->by_name ? "By {$r->by_name}" : null,
                'at'    => $r->created_at,
            ]);

        $registrations = DB::table('users')
            ->whereIn('role_id', array_keys($types))
            ->when($countryId, fn ($q) => $q->where('country_id', $countryId))
            ->when($zccViewer, fn ($q) => ZccScope::apply($q, 'users', $zccViewer))
            ->orderByDesc('created_at')->limit(6)
            ->get(['role_id', 'full_name', 'regno', 'created_at'])
            ->map(fn ($r) => [
                'kind'  => 'registered',
                'title' => ($types[(int) $r->role_id] ?? 'Artist') . ' registered',
                'name'  => $r->full_name,
                'meta'  => $r->regno,
                'at'    => $r->created_at,
            ]);

        $events = DB::table('events')->where('is_deleted', 0)
            ->when($countryId, fn ($q) => $q->where('country_id', $countryId))
            ->orderByDesc('created_at')->limit(6)
            ->get(['title', 'organised_by', 'created_at'])
            ->map(fn ($r) => [
                'kind'  => 'event',
                'title' => 'New event published',
                'name'  => $r->title,
                'meta'  => $r->organised_by ? "By {$r->organised_by}" : null,
                'at'    => $r->created_at,
            ]);

        return $decisions->concat($registrations)->concat($events)
            ->filter(fn ($a) => $a['at'])
            ->sortByDesc('at')->take(5)
            ->map(fn ($a) => ['at' => \Illuminate\Support\Carbon::parse($a['at'])->toIso8601String()] + $a)
            ->values()->all();
    }

    private function upcomingEvents($events): array
    {
        return (clone $events)
            ->leftJoin('countries as c', 'c.id', '=', 'events.country_id')
            ->where('events.event_date', '>=', now()->startOfDay())
            ->orderBy('events.event_date')->limit(4)
            ->get(['events.id', 'events.title', 'events.organised_by', 'events.city', 'c.name as country_name', 'events.event_date', 'events.is_active'])
            ->map(fn ($e) => [
                'id'           => (int) $e->id,
                'title'        => $e->title,
                'organised_by' => $e->organised_by,
                'location'     => $e->city ?: $e->country_name,
                'event_date'   => \Illuminate\Support\Carbon::parse($e->event_date)->toDateString(),
                'status'       => (int) $e->is_active === 1 ? 'Published' : 'Unpublished',
            ])->all();
    }

    public function profile(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing('role');

        $countries = DB::table('countries')->orderBy('name')->get(['id', 'name']);
        $regions = DB::table('art_regions')
            ->where('status', 1)
            ->when($user->country_id, fn ($q) => $q->where('country_id', $user->country_id))
            ->orderBy('name')
            ->get(['id', 'name']);

        return $this->success([
            'user' => [
                'id'          => $user->id,
                'regno'       => $user->regno,
                'role'        => $user->role?->name,
                'firstname'   => $user->firstname,
                'lastname'    => $user->lastname,
                'full_name'   => $user->full_name,
                'gender'      => $user->gender !== null ? (string) $user->gender : '',
                'email'       => $user->email,
                'mobile'      => $user->mobile,
                // Verified email / mobile are shown read-only and cannot be changed.
                'email_verified'  => (bool) ($user->email_verified_at && $user->email),
                'mobile_verified' => (bool) ($user->mobile_verified_at && $user->mobile),
                'designation' => $user->designation,
                'department'  => $user->getAttribute('department'),
                'country_id'  => $user->country_id,
                'region_id'   => $user->region_id,
                'city'        => $user->city,
                'pincode'     => $user->pincode,
                'address'     => $user->address,
            ],
            'countries'      => $countries,
            'regions'        => $regions,
            'gender_options' => genderOptions(),
            // ZCC officials: no State / UT to choose; the page shows their centre and member States / UTs.
            'zcc'            => ZccScope::isZcc($user) ? $this->zccProfile($user) : null,
        ]);
    }

    /** The ZCC official's centre details for the profile page. */
    private function zccProfile(User $user): array
    {
        $zcc = ZccScope::centre($user);
        if (! $zcc) {
            return ['linked' => false];
        }

        return [
            'linked'              => true,
            'code'                => $zcc->code,
            'name'                => $zcc->name,
            'headquarters'        => $zcc->headquarters,
            'contact_person'      => $zcc->contact_person,
            'contact_designation' => $zcc->contact_designation,
            'contact_mobile'      => $zcc->contact_mobile,
            'contact_mobile_alt'  => $zcc->contact_mobile_alt,
            'contact_email'       => $zcc->contact_email,
            'states'              => DB::table('zcc_states as z')->join('states as s', 's.id', '=', 'z.state_id')
                ->where('z.zcc_id', $zcc->id)->orderBy('s.StateName')->get(['s.StateName as name', 's.ShortName as short']),
        ];
    }

    /** Same rules as Backend\UserController::updateProfile. */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = User::findOrFail(Auth::id());

        $data = $request->validate([
            'firstname'   => ['required', 'string', 'max:100', 'regex:/^[a-zA-Z\s]+$/'],
            'lastname'    => ['required', 'string', 'max:100', 'regex:/^[a-zA-Z\s]+$/'],
            'gender'      => ['required', Rule::in(array_keys(genderOptions()))],
            // A verified email / mobile is locked: it can be re-sent unchanged only.
            'email'       => $user->email_verified_at && $user->email
                ? ['required', function ($attr, $value, $fail) use ($user) {
                    if (mb_strtolower(trim((string) $value)) !== mb_strtolower((string) $user->email)) {
                        $fail('Your email address is verified and cannot be changed.');
                    }
                }]
                : ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'mobile'      => $user->mobile_verified_at && $user->mobile
                ? ['required', Rule::in([(string) $user->mobile])]
                : ['required', 'digits:10'],
            'designation' => ['nullable', 'string', 'max:255'],
            'region_id'   => ['nullable', 'integer', Rule::exists('art_regions', 'id')
                ->where('country_id', $user->country_id)->where('status', 1)],
            'city'        => ['required', 'string', 'max:255'],
            'pincode'     => ['nullable', 'string', 'max:55'],
            'address'     => ['nullable', 'string', 'max:255'],
        ], [
            'firstname.required' => 'Enter First Name',
            'firstname.regex'    => 'First Name must contain letters and spaces only',
            'lastname.required'  => 'Enter Last Name',
            'lastname.regex'     => 'Last Name must contain letters and spaces only',
            'gender.required'    => 'Please select Gender',
            'email.required'     => 'Enter Email',
            'email.email'        => 'Enter a valid Email',
            'email.unique'       => 'This Email is already registered',
            'mobile.required'    => 'Enter Mobile Number',
            'mobile.digits'      => 'Mobile number must be exactly 10 digits',
            'mobile.in'          => 'Your mobile number is verified and cannot be changed.',
            'region_id.exists'   => 'Please select a valid region for your country',
            'city.required'      => 'Please enter City / Town',
        ]);

        $first = trim($data['firstname']);
        $last = trim($data['lastname']);

        // Country, role and regno stay unchanged, as in the Blade panel.
        $user->forceFill([
            'firstname'   => $first,
            'lastname'    => $last,
            'full_name'   => trim("$first $last"),
            'gender'      => $data['gender'],
            'email'       => $user->email_verified_at && $user->email ? $user->email : trim($data['email']),
            'mobile'      => $user->mobile_verified_at && $user->mobile ? $user->mobile : $data['mobile'],
            'designation' => $data['designation'] ?? null,
            // ZCC officials do not choose a State / UT (their zone is the ZCC's member States).
            'region_id'   => ZccScope::isZcc($user) ? $user->region_id : ($data['region_id'] ?? null),
            'city'        => trim($data['city']),
            'pincode'     => $data['pincode'] ?? null,
            'address'     => $data['address'] ?? null,
            'updated_by'  => Auth::id(),
        ])->save();

        return $this->success(null, 'Your profile has been updated successfully.');
    }

    /** Same rules as Backend\UserController::updatePassword. */
    public function updatePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password'         => ['required', 'string', 'min:12', 'max:72', 'confirmed', 'different:current_password'],
        ], [
            'password.different' => 'Your new password must be different from your current password.',
        ]);

        $user = User::findOrFail(Auth::id());

        if (!$user->verifyPassword($data['current_password'])) {
            return $this->error('The current password is incorrect.', 422, 'validation_error', [
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->password = Hash::make($data['password']);
        $user->save();

        return $this->success(null, 'Your password has been changed successfully.');
    }

    /** Artist / Group dashboard figures: own opportunities, requests, performances. */
    private function artistSummary(User $user): array
    {
        $today = now()->toDateString();
        $m = DB::table('booking_matches as m')->join('booking_requirements as r', 'r.id', '=', 'm.requirement_id')
            ->where('m.artist_id', $user->id)->where('r.status', '!=', 'draft');
        $live = fn ($q) => $q->whereIn('r.status', ['open', 'booked'])->whereDate('r.event_date', '>=', $today);

        return [
            'regno' => $user->regno,
            'type' => [5 => 'Individual Artist', 6 => 'Artist Group', 7 => 'Organisation / Institute'][(int) $user->role_id] ?? null,
            'verified_status' => (int) $user->verified_status,
            'profile_completed' => (bool) $user->profile_completed,
            'open_opportunities' => $live(clone $m)->whereNull('m.booking_status')->count(),
            'pending_requests' => $live(clone $m)->whereNotNull('m.invited_at')->where('m.interest', 'pending')->whereNull('m.booking_status')->count(),
            'confirmed' => (clone $m)->where('m.booking_status', 'confirmed')->count(),
            'completed' => (clone $m)->where('m.booking_status', 'completed')->count(),
            'saved' => (clone $m)->whereNotNull('m.saved_at')->count(),
            'unread_notifications' => DB::table('user_notifications')->where('user_id', $user->id)->whereNull('read_at')->count(),
            'members' => (int) $user->role_id === 6 ? DB::table('artist_group_members')->where('group_id', $user->id)->count() : null,
            'upcoming' => (clone $m)->where('m.booking_status', 'confirmed')->whereDate('r.event_date', '>=', $today)->orderBy('r.event_date')->limit(5)
                ->get(['r.id', 'r.title', 'r.event_date', 'r.venue', 'r.city'])
                ->map(fn ($r) => ['id' => $r->id, 'title' => $r->title, 'event_date' => substr((string) $r->event_date, 0, 10), 'venue' => collect([$r->venue, $r->city])->filter()->implode(', ')]),
        ];
    }
}
