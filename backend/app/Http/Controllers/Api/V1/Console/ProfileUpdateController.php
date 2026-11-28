<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\ArtistProfileRevision as Revision;
use App\Models\ArtistProfileRevisionEvent as RevisionEvent;
use App\Models\User;
use App\Services\ArtistProfileService;
use App\Services\ArtistRevisionService;
use App\Support\ZccScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Artist Management -> Update Requests (ZCC Nodal Officers and Admins).
 *
 *   GET  /profile-updates                 list (status tab, search, type, dates) + counts
 *   GET  /profile-updates/report          totals by status / type, rows for CSV
 *   GET  /profile-updates/{id}            current vs requested profile, documents, history
 *   POST /profile-updates/{id}/decision   { decision: approved|rejected, remarks }
 */
class ProfileUpdateController extends Controller
{
    use ApiResponse, ConsoleScope;

    private const TYPE_LABELS = [5 => 'Individual Artist', 6 => 'Artist Group', 7 => 'Organisation / Institute'];

    public function __construct(
        private readonly ArtistProfileService $profiles,
        private readonly ArtistRevisionService $revisions,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $f = $request->validate([
            'status'            => ['nullable', Rule::in(['submitted', 'approved', 'rejected'])],
            'search'            => ['nullable', 'string', 'max:100'],
            'registration_type' => ['nullable', Rule::in(['5', '6', '7'])],
            'date_from'         => ['nullable', 'date'],
            'date_to'           => ['nullable', 'date', 'after_or_equal:date_from'],
            'page'              => ['nullable', 'integer', 'min:1'],
        ]);
        $status = $f['status'] ?? 'submitted';

        $base = $this->baseQuery($f);
        $counts = (clone $base)->select('r.status', DB::raw('COUNT(*) as total'))->groupBy('r.status')->pluck('total', 'status');
        $page = (clone $base)->where('r.status', $status)
            ->orderByDesc(DB::raw('COALESCE(r.submitted_at, r.updated_at)'))
            ->select(['r.id', 'r.user_id', 'r.registration_type', 'r.revision_number', 'r.status', 'r.submitted_at', 'r.decided_at', 'r.remarks',
                'u.regno', 'u.email', 'u.verified_status', DB::raw("COALESCE(ag.group_name, ai.institution_name, u.full_name) as artist_name")])
            ->paginate(20, ['*'], 'page', (int) ($f['page'] ?? 1));

        return $this->success([
            'items' => collect($page->items())->map(fn ($r) => [
                'id'           => $r->id,
                'number'       => (int) $r->revision_number,
                'artist_name'  => $r->artist_name,
                'regno'        => $r->regno,
                'email'        => $r->email,
                'type_label'   => self::TYPE_LABELS[(int) $r->registration_type] ?? '—',
                'kind'         => (int) $r->verified_status === 2 ? 'Corrected application' : 'Profile update',
                'status'       => $r->status,
                'submitted_at' => $r->submitted_at,
                'decided_at'   => $r->decided_at,
                'remarks'      => $r->remarks,
            ])->values(),
            'meta'   => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'from' => $page->firstItem(), 'to' => $page->lastItem()],
            'counts' => ['submitted' => (int) ($counts['submitted'] ?? 0), 'approved' => (int) ($counts['approved'] ?? 0), 'rejected' => (int) ($counts['rejected'] ?? 0)],
            'can_decide' => $this->can('/profile-updates', 'edit'),
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $rev = Revision::query()->findOrFail($id);
        abort_if($rev->status === Revision::STATUS_DRAFT, 404);
        $user = User::query()->findOrFail($rev->user_id);
        ZccScope::authorize($user);
        $current = $this->profiles->snapshotFor($user);
        $rows = $this->profiles->compare($current, $rev->snapshot);
        $people = User::query()->whereIn('id', array_filter([$rev->decided_by]))->pluck('full_name', 'id');

        return $this->success([
            'revision' => [
                'id' => $rev->id, 'number' => (int) $rev->revision_number, 'status' => $rev->status,
                'submitted_at' => optional($rev->submitted_at)->toIso8601String(),
                'decided_at' => optional($rev->decided_at)->toIso8601String(),
                'decided_by' => $people[$rev->decided_by] ?? null,
                'remarks' => $rev->remarks,
            ],
            'artist' => [
                'id' => $user->id, 'name' => $this->revisions->artistName($user, $current), 'regno' => $user->regno,
                'email' => $user->email, 'mobile' => $user->mobile,
                'type_label' => self::TYPE_LABELS[(int) $user->role_id] ?? '—',
                'kind' => (int) $user->verified_status === 2 ? 'Corrected application (registration was rejected)' : 'Update to an approved profile',
            ],
            'rows'    => $rows,
            'changed' => count(array_filter($rows, fn ($r) => $r['status'] !== 'unchanged')),
            'documents_current'  => $this->documents($current),
            'documents_proposed' => $this->documents($rev->snapshot),
            'history' => Revision::query()->where('user_id', $user->id)->where('status', '!=', Revision::STATUS_DRAFT)
                ->orderByDesc('revision_number')->get(['id', 'revision_number', 'status', 'submitted_at', 'decided_at', 'remarks'])
                ->map(fn ($r) => ['id' => $r->id, 'number' => (int) $r->revision_number, 'status' => $r->status,
                    'submitted_at' => optional($r->submitted_at)->toIso8601String(), 'decided_at' => optional($r->decided_at)->toIso8601String(), 'remarks' => $r->remarks]),
            'events' => RevisionEvent::query()->where('revision_id', $rev->id)->latest('id')->get(['action', 'actor_id', 'remarks', 'created_at'])
                ->map(fn ($e) => ['action' => $e->action, 'at' => optional($e->created_at)->toIso8601String(), 'remarks' => $e->remarks]),
            'can_decide' => $rev->status === Revision::STATUS_SUBMITTED && $this->can('/profile-updates', 'edit'),
        ]);
    }

    public function decide(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'decision' => ['required', Rule::in(['approved', 'rejected'])],
            'remarks'  => ['nullable', 'string', 'max:5000', Rule::requiredIf(fn () => $request->input('decision') === 'rejected')],
        ], ['remarks.required' => 'Please give the reason for rejection; it is sent to the artist.']);

        $revision = Revision::query()->findOrFail($id);
        ZccScope::authorize(User::query()->findOrFail($revision->user_id));
        $rev = $this->revisions->decide($revision, $data['decision'], $data['remarks'] ?? null, $request->user(), $request->ip());

        return $this->success(['status' => $rev->status], $data['decision'] === 'approved'
            ? 'Request approved. The changes are now live and the artist has been informed.'
            : 'Request rejected. The artist has been informed with your remarks.');
    }

    public function report(Request $request): JsonResponse
    {
        $f = $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to'   => ['nullable', 'date', 'after_or_equal:date_from'],
        ]);
        $base = $this->baseQuery($f);

        $byType = (clone $base)->select('r.registration_type', 'r.status', DB::raw('COUNT(*) as total'))
            ->groupBy('r.registration_type', 'r.status')->get()
            ->groupBy('registration_type')->map(fn ($rows, $type) => [
                'type' => self::TYPE_LABELS[(int) $type] ?? '—',
                'submitted' => (int) ($rows->firstWhere('status', 'submitted')->total ?? 0),
                'approved' => (int) ($rows->firstWhere('status', 'approved')->total ?? 0),
                'rejected' => (int) ($rows->firstWhere('status', 'rejected')->total ?? 0),
            ])->values();

        $resubmitted = RevisionEvent::query()->where('action', 'resubmitted')
            ->when(ZccScope::isZcc(), fn ($q) => $q->whereIn('user_id', ZccScope::apply(User::query()->select('users.id'))))
            ->when($f['date_from'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
            ->when($f['date_to'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '<=', $d))->count();

        $rows = (clone $base)->orderBy('r.submitted_at')
            ->get(['u.regno', 'u.email', 'r.registration_type', 'r.revision_number', 'r.status', 'r.submitted_at', 'r.decided_at', 'r.remarks',
                DB::raw("COALESCE(ag.group_name, ai.institution_name, u.full_name) as artist_name")])
            ->map(fn ($r) => [
                'regno' => $r->regno, 'artist' => $r->artist_name, 'email' => $r->email,
                'type' => self::TYPE_LABELS[(int) $r->registration_type] ?? '—', 'request' => (int) $r->revision_number,
                'status' => $r->status, 'submitted_at' => $r->submitted_at, 'decided_at' => $r->decided_at, 'remarks' => $r->remarks,
            ]);

        return $this->success([
            'totals' => [
                'approved_profiles' => ZccScope::apply(User::query()->whereIn('role_id', [5, 6, 7])->where('verified_status', 1))->count(),
                'pending'     => $rows->where('status', 'submitted')->count(),
                'approved'    => $rows->where('status', 'approved')->count(),
                'rejected'    => $rows->where('status', 'rejected')->count(),
                'resubmitted' => $resubmitted,
            ],
            'by_type' => $byType,
            'rows'    => $rows->values(),
        ]);
    }

    /** Submitted / decided requests (drafts are private to the artist), with filters. */
    private function baseQuery(array $f)
    {
        return DB::table('artist_profile_revisions as r')
            ->join('users as u', 'u.id', '=', 'r.user_id')
            ->leftJoin('artist_group_details as ag', 'ag.user_id', '=', 'u.id')
            ->leftJoin('artist_institution_details as ai', 'ai.user_id', '=', 'u.id')
            ->whereIn('r.status', ['submitted', 'approved', 'rejected'])
            ->whereNotNull('r.submitted_at') // excludes the automatic baseline (#1)
            ->when(ZccScope::isZcc(), fn ($q) => ZccScope::apply($q, 'u')) // ZCC: own member States / UTs
            ->when($f['registration_type'] ?? null, fn ($q, $t) => $q->where('r.registration_type', (int) $t))
            ->when($f['date_from'] ?? null, fn ($q, $d) => $q->whereDate('r.submitted_at', '>=', $d))
            ->when($f['date_to'] ?? null, fn ($q, $d) => $q->whereDate('r.submitted_at', '<=', $d))
            ->when($f['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w
                ->where('u.regno', 'ilike', "%{$s}%")->orWhere('u.full_name', 'ilike', "%{$s}%")->orWhere('u.email', 'ilike', "%{$s}%")
                ->orWhere('ag.group_name', 'ilike', "%{$s}%")->orWhere('ai.institution_name', 'ilike', "%{$s}%")));
    }

    private function documents(array $snapshot): array
    {
        $labels = $this->profiles->fileLabels($snapshot['type']);
        $out = [];
        foreach ($snapshot['files'] ?? [] as $slot => $value) {
            foreach (array_filter((array) $value) as $i => $path) {
                $out[] = ['label' => ($labels[$slot] ?? $slot).(is_array($value) ? ' '.($i + 1) : ''), 'name' => basename($path), 'url' => $this->uploadUrl($path)];
            }
        }
        foreach ($snapshot['awards'] ?? [] as $a) {
            if (! empty($a['certificate_path'])) {
                $out[] = ['label' => 'Certificate: '.$a['name'], 'name' => basename($a['certificate_path']), 'url' => $this->uploadUrl($a['certificate_path'])];
            }
        }

        return $out;
    }
}
