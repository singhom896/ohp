<?php

namespace App\Http\Controllers\Api\V1\Artist;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\ArtistProfileRevision as Revision;
use App\Models\ArtistProfileRevisionEvent as RevisionEvent;
use App\Models\User;
use App\Services\ArtistProfileService;
use App\Services\ArtistRevisionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * "My Application" for signed-in artists (Next.js /artist/application).
 *
 *   GET /artist/application           overview: status, completion, open requests, recent requests
 *   GET /artist/application/details   the live profile, field by field, with documents
 *   GET /artist/application/preview   live profile vs. the open draft / pending / rejected request
 *   GET /artist/application/history   every request and every action on it
 */
class ArtistApplicationController extends Controller
{
    use ApiResponse, ConsoleScope;

    private const STATUS_LABELS = [0 => 'Under Review', 1 => 'Approved', 2 => 'Rejected', 3 => 'Changes Requested'];

    public function __construct(
        private readonly ArtistProfileService $profiles,
        private readonly ArtistRevisionService $revisions,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $this->artist($request);
        $live = $this->profiles->snapshotFor($user);
        $type = $live['type'];
        $v = $live['values'];
        $recent = Revision::query()->where('user_id', $user->id)->latest('revision_number')->limit(5)->get();
        $approval = $this->revisions->needsApproval($user);
        $pending = $approval ? $this->revisions->pending($user) : null;
        $editable = $approval ? $this->revisions->latestEditable($user) : null;
        $lastApproved = Revision::query()->where('user_id', $user->id)->where('status', Revision::STATUS_APPROVED)->latest('revision_number')->first();

        $artForms = match ($type) {
            'individual' => array_filter([(int) $v['art_form_id']]),
            'group' => array_merge([(int) $v['primary_art_form_id']], $v['other_art_form_ids']),
            default => $v['art_form_ids'],
        };

        return $this->success([
            'type'            => $type,
            'type_label'      => ArtistProfileService::TYPE_LABELS[$type],
            'regno'           => $user->regno,
            'email'           => $user->email,
            'verified_status' => (int) $user->verified_status,
            'status_label'    => self::STATUS_LABELS[(int) $user->verified_status] ?? 'Under Review',
            'profile_completed' => (bool) $user->profile_completed,
            'completion'      => $this->profiles->completion($live),
            'mode'            => $approval ? 'request' : 'direct',
            'initial_rejection' => $this->revisions->initialRejection($user),
            'changes_requested' => (int) $user->verified_status === 3
                ? DB::table('artist_status_histories')->where('user_id', $user->id)->where('new_status', 3)->latest('id')->value('remarks')
                : null,
            'pending'         => $pending ? $this->summary($pending) : null,
            'draft'           => $editable && $editable->status === Revision::STATUS_DRAFT ? $this->summary($editable) : null,
            'rejected'        => $editable && $editable->status === Revision::STATUS_REJECTED ? $this->summary($editable) : null,
            'last_approved'   => $lastApproved ? $this->summary($lastApproved) : null,
            'recent'          => $recent->map(fn ($r) => $this->summary($r))->values(),
            'profile'         => [
                'name'      => $this->revisions->artistName($user, $live),
                'photo'     => $this->uploadUrl($live['files']['profile_photo'] ?? $live['files']['institution_logo'] ?? null),
                'art_forms' => DB::table('art_forms')->whereIn('id', array_filter($artForms))->pluck('name')->values(),
                'location'  => collect([
                    $v['city'] ?? '',
                    DB::table('districts')->where('id', (int) $v['district_id'])->value('DistrictName'),
                    DB::table('states')->where('id', (int) $v['state_id'])->value('StateName'),
                ])->filter()->unique()->implode(', '),
            ],
        ]);
    }

    public function details(Request $request): JsonResponse
    {
        $user = $this->artist($request);
        $live = $this->profiles->snapshotFor($user);

        return $this->success([
            'type_label' => ArtistProfileService::TYPE_LABELS[$live['type']],
            'regno'      => $user->regno,
            'email'      => $user->email,
            'rows'       => collect($this->profiles->compare($live, $live))->map(fn ($r) => ['label' => $r['label'], 'section' => $r['section'], 'value' => $r['after']])->values(),
            'documents'  => $this->documents($live),
        ]);
    }

    public function preview(Request $request): JsonResponse
    {
        $user = $this->artist($request);
        $live = $this->profiles->snapshotFor($user);
        $open = $this->revisions->needsApproval($user)
            ? ($this->revisions->pending($user) ?? $this->revisions->latestEditable($user))
            : null;
        if (! $open) {
            return $this->success(['revision' => null, 'rows' => [], 'changed' => 0]);
        }
        $rows = $this->profiles->compare($live, $open->snapshot);

        return $this->success([
            'revision' => $this->summary($open),
            'rows'     => $rows,
            'changed'  => count(array_filter($rows, fn ($r) => $r['status'] !== 'unchanged')),
            'documents_current'  => $this->documents($live),
            'documents_proposed' => $this->documents($open->snapshot),
        ]);
    }

    public function history(Request $request): JsonResponse
    {
        $user = $this->artist($request);
        $names = fn ($ids) => User::query()->whereIn('id', array_filter($ids))->pluck('full_name', 'id');
        $revisions = Revision::query()->where('user_id', $user->id)->orderByDesc('revision_number')->get();
        $events = RevisionEvent::query()->where('user_id', $user->id)->latest('id')->limit(100)->get();
        $people = $names($revisions->pluck('decided_by')->merge($events->pluck('actor_id'))->all());
        $numbers = $revisions->pluck('revision_number', 'id');

        return $this->success([
            'revisions' => $revisions->map(fn ($r) => $this->summary($r) + ['decided_by' => $people[$r->decided_by] ?? null])->values(),
            'events'    => $events->map(fn ($e) => [
                'id'        => $e->id,
                'action'    => $e->action,
                'number'    => $numbers[$e->revision_id] ?? null,
                'at'        => optional($e->created_at)->toIso8601String(),
                'by'        => $e->actor_id === $user->id ? 'You' : ($people[$e->actor_id] ?? ($e->actor_id ? 'Reviewer' : 'System')),
                'remarks'   => $e->remarks,
                'changes'   => collect($e->changes ?? [])->map(fn ($c) => ['label' => $c['label'], 'before' => $c['before'], 'after' => $c['after']])->values(),
            ])->values(),
        ]);
    }

    private function artist(Request $request): User
    {
        $user = $request->user();
        abort_unless($user && isset(ArtistProfileService::TYPES[(int) $user->role_id]), 403, 'My Application is available to artist accounts only.');

        return $user;
    }

    private function summary(Revision $r): array
    {
        return [
            'id'           => $r->id,
            'number'       => (int) $r->revision_number,
            'status'       => $r->status,
            'submitted_at' => optional($r->submitted_at)->toIso8601String(),
            'decided_at'   => optional($r->decided_at)->toIso8601String(),
            'updated_at'   => optional($r->updated_at)->toIso8601String(),
            'remarks'      => $r->remarks,
        ];
    }

    /** [label, name, url] for every document in a snapshot. */
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
