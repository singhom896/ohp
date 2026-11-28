<?php

namespace App\Http\Controllers\Api\V1\Artist;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\ArtistProfileService;
use App\Services\ArtistRevisionService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * "My Profile" for signed-in artists (Next.js /artist/profile).
 *
 *   GET  /artist/profile    form values, files, awards, options + how saving works
 *   POST /artist/profile    save (multipart). action = save | draft | submit
 *
 * How saving works (ArtistRevisionService):
 *   - registration not reviewed yet (verified_status 0): "save" writes directly;
 *   - approved (1) or rejected (2): "draft" keeps an update request,
 *     "submit" sends it to the ZCC Nodal Officer / Admin for approval.
 * The email address is the verified login and cannot be changed here; the
 * password has its own page (Change Password).
 */
class ArtistProfileController extends Controller
{
    use ApiResponse, ConsoleScope;

    public function __construct(
        private readonly ArtistProfileService $profiles,
        private readonly ArtistRevisionService $revisions,
        private readonly NotificationService $notifications,
    ) {}

    public function show(Request $request): JsonResponse
    {
        return $this->success($this->payload($this->artist($request)));
    }

    public function update(Request $request): JsonResponse
    {
        $user = $this->artist($request);
        $approval = $this->revisions->needsApproval($user);
        $action = $request->validate([
            'action' => ['nullable', Rule::in($approval ? ['draft', 'submit'] : ['save'])],
        ])['action'] ?? ($approval ? 'submit' : 'save');

        if ($approval && $this->revisions->pending($user)) {
            return $this->error('Your update is waiting for review. You can edit again after the decision.', 409, 'update_pending');
        }

        $base = $approval ? $this->revisions->editableSnapshot($user) : $this->profiles->snapshotFor($user);
        $data = $this->profiles->validate($request, $user, $base);

        $stored = [];
        try {
            $snapshot = $this->profiles->makeSnapshot($request, $user, $data, $base, $stored);
            if ($approval) {
                $this->revisions->save($user, $base, $snapshot, $action, $request->ip());
            } else {
                $this->profiles->apply($user, $snapshot, $user->id);
                if ((int) $user->verified_status === 3) {
                    $this->resubmitAfterChanges($user);
                }
            }
        } catch (Throwable $e) {
            foreach ($stored as $path) {
                Storage::disk('public_uploads')->delete($path);
            }
            throw $e;
        }

        $message = match (true) {
            $action === 'draft'  => 'Your changes were saved as a draft. Submit them when you are ready.',
            $action === 'submit' => 'Your update was submitted for approval. You will be informed by email.',
            (int) $user->verified_status === 3 => 'Profile updated and sent back to your Zonal Cultural Centre for review.',
            default => 'Profile updated successfully.',
        };

        return $this->success($this->payload($user->fresh()), $message);
    }

    /**
     * "Changes Requested" (3) -> Pending (0) once the artist saves the corrected
     * profile; logged in the status history. It then reappears under Pending in
     * the Artist Management list of the artist's ZCC(s).
     */
    private function resubmitAfterChanges(User $user): void
    {
        DB::transaction(function () use ($user) {
            $updated = DB::table('users')->where('id', $user->id)->where('verified_status', 3)
                ->update(['verified_status' => 0, 'updated_by' => $user->id, 'updated_at' => now()]);
            if ($updated) {
                DB::table('artist_status_histories')->insert([
                    'user_id' => $user->id, 'registration_type' => (int) $user->role_id, 'old_status' => 3, 'new_status' => 0,
                    'remarks' => 'Profile corrected by the artist and resubmitted for review.',
                    'created_by' => $user->id, 'updated_by' => $user->id, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });

        $this->notifications->notify($user->id, 'Profile resubmitted for review',
            'Thank you for updating your profile. Your Zonal Cultural Centre will review it again.', '/application');
    }

    private function artist(Request $request): User
    {
        $user = $request->user();
        abort_unless($user && isset(ArtistProfileService::TYPES[(int) $user->role_id]), 403, 'My Profile is available to artist accounts only.');

        return $user;
    }

    private function payload(User $user): array
    {
        $type = $this->profiles->typeFor($user);
        $approval = $this->revisions->needsApproval($user);
        $pending = $approval ? $this->revisions->pending($user) : null;
        $editable = $approval ? $this->revisions->latestEditable($user) : null;
        // While a request is pending the form shows it (read-only); else the draft / rejected request; else live data.
        $snapshot = $pending?->snapshot ?? $editable?->snapshot ?? $this->profiles->snapshotFor($user);

        return [
            'type'            => $type,
            'type_label'      => ArtistProfileService::TYPE_LABELS[$type],
            'regno'           => $user->regno,
            'email'           => $user->email,
            // Verified email / mobile are read-only on the form (and enforced on save).
            'email_verified'  => (bool) $user->email_verified_at,
            'mobile_verified' => (bool) ($user->mobile_verified_at && $user->mobile),
            'verified_status' => $user->verified_status === null ? null : (int) $user->verified_status,
            'changes_requested' => (int) $user->verified_status === 3
                ? DB::table('artist_status_histories')->where('user_id', $user->id)->where('new_status', 3)->latest('id')->value('remarks')
                : null,
            'profile_completed' => (bool) $user->profile_completed,
            'mode'            => $approval ? 'request' : 'direct',
            'locked'          => (bool) $pending,
            'pending'         => $pending ? ['id' => $pending->id, 'number' => $pending->revision_number, 'submitted_at' => optional($pending->submitted_at)->toIso8601String()] : null,
            'draft'           => $editable && $editable->status === 'draft' ? ['id' => $editable->id, 'number' => $editable->revision_number, 'updated_at' => optional($editable->updated_at)->toIso8601String()] : null,
            'rejected'        => $editable && $editable->status === 'rejected' ? ['number' => $editable->revision_number, 'remarks' => $editable->remarks] : null,
            'initial_rejection' => $this->revisions->initialRejection($user),
        ] + $this->profiles->formPayload($snapshot, fn (?string $p) => $this->uploadUrl($p));
    }
}
