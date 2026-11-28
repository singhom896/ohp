<?php

namespace App\Services;

use App\Mail\ArtistProfileApprovedMail;
use App\Mail\ArtistProfileRejectedMail;
use App\Mail\ArtistProfileUpdateSubmittedMail;
use App\Mail\ZccArtistProfileActionMail;
use App\Models\ArtistProfileRevision as Revision;
use App\Models\ArtistProfileRevisionEvent as RevisionEvent;
use App\Models\User;
use App\Support\ZccScope;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Artist profile update requests ("revisions"), as in the BRICS Artist Registry:
 *
 *  - verified_status 0 (new / pending first review) or 3 (changes requested by
 *    the ZCC): the artist saves directly; saving a 3 sends it back to 0 (pending).
 *  - verified_status 1 (approved) or 2 (rejected): every change is a revision
 *    (draft or submitted). Only one submitted revision at a time. An official of
 *    the artist's Zonal Cultural Centre (role 8, App\Support\ZccScope) or an Admin approves it (snapshot applied to the live data)
 *    or rejects it with remarks. Approving the correction of a rejected
 *    application also marks the registration approved.
 *
 * Revision #1 is the approved baseline (created the first time an approved
 * artist starts editing), so the history always shows where changes began.
 */
class ArtistRevisionService
{
    public const ZCC_ROLE = 8;

    public function __construct(
        private readonly ArtistProfileService $profiles,
        private readonly EmailService $email,
    ) {}

    /** Saving needs approval when the registration was already reviewed (approved or rejected). */
    public function needsApproval(User $user): bool
    {
        return in_array((int) $user->verified_status, [1, 2], true);
    }

    public function pending(User $user, bool $lock = false): ?Revision
    {
        $q = Revision::query()->where('user_id', $user->id)->where('status', Revision::STATUS_SUBMITTED);

        return ($lock ? $q->lockForUpdate() : $q)->latest('revision_number')->first();
    }

    /** Draft, or the latest rejected request not yet superseded by an approval: the artist continues from it. */
    public function latestEditable(User $user): ?Revision
    {
        $latest = Revision::query()->where('user_id', $user->id)->latest('revision_number')->first();

        return $latest && in_array($latest->status, [Revision::STATUS_DRAFT, Revision::STATUS_REJECTED], true) ? $latest : null;
    }

    /** What the edit form starts from: an open draft / rejected request, else the live profile. */
    public function editableSnapshot(User $user): array
    {
        return $this->latestEditable($user)?->snapshot ?? $this->profiles->snapshotFor($user);
    }

    /** Latest remarks of a rejected first registration (users.verified_status = 2). */
    public function initialRejection(User $user): ?string
    {
        return (int) $user->verified_status === 2
            ? DB::table('artist_status_histories')->where('user_id', $user->id)
                ->where('registration_type', (int) $user->role_id)->where('new_status', 2)
                ->latest('id')->value('remarks')
            : null;
    }

    /**
     * Save a revision. $action: draft | submit. Returns the revision.
     * The base snapshot is what the form started from (for the change list).
     */
    public function save(User $user, array $base, array $snapshot, string $action, ?string $ip): Revision
    {
        return DB::transaction(function () use ($user, $base, $snapshot, $action, $ip) {
            $locked = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            if (! $this->needsApproval($locked)) {
                throw ValidationException::withMessages(['action' => 'This profile is saved directly; no approval request is needed.']);
            }
            if ((int) $locked->verified_status === 1) {
                $this->ensureBaseline($locked);
            }
            if ($this->pending($locked, true)) {
                throw ValidationException::withMessages(['action' => 'An update is already pending review. Please wait for the decision.']);
            }

            $submit = $action === 'submit';
            $data = [
                'snapshot'          => $snapshot,
                'registration_type' => (int) $locked->role_id,
                'status'            => $submit ? Revision::STATUS_SUBMITTED : Revision::STATUS_DRAFT,
                'submitted_by'      => $submit ? $locked->id : null,
                'submitted_at'      => $submit ? now() : null,
                'ip_address'        => $submit ? $ip : null,
            ];

            $draft = Revision::query()->where('user_id', $locked->id)->where('status', Revision::STATUS_DRAFT)
                ->lockForUpdate()->latest('revision_number')->first();
            if ($draft) {
                $draft->fill($data)->save();
                $revision = $draft->refresh();
            } else {
                $revision = Revision::query()->create($data + [
                    'user_id'         => $locked->id,
                    'revision_number' => (int) Revision::query()->where('user_id', $locked->id)->max('revision_number') + 1,
                ]);
            }

            $lastApproved = (int) Revision::query()->where('user_id', $locked->id)->where('status', Revision::STATUS_APPROVED)->max('revision_number');
            $isResubmission = Revision::query()->where('user_id', $locked->id)->where('status', Revision::STATUS_REJECTED)
                ->where('revision_number', '>', $lastApproved)->where('revision_number', '<', $revision->revision_number)->exists();

            RevisionEvent::query()->create([
                'revision_id' => $revision->id,
                'user_id'     => $locked->id,
                'actor_id'    => $locked->id,
                'action'      => ! $submit ? 'draft_saved' : ($isResubmission ? 'resubmitted' : 'submitted'),
                'changes'     => $this->profiles->changesBetween($base, $snapshot),
                'ip_address'  => $ip,
            ]);

            if ($submit) {
                $label = match (true) {
                    (int) $locked->verified_status === 2 => 'Rejected application corrected and resubmitted',
                    $isResubmission => 'Rejected profile update resubmitted',
                    default => 'Profile update submitted',
                };
                DB::afterCommit(fn () => $this->notifySubmitted($locked, $revision, $label));
            }

            return $revision;
        });
    }

    /** Approve or reject a submitted revision (ZCC / Admin). */
    public function decide(Revision $revision, string $decision, ?string $remarks, User $actor, ?string $ip): Revision
    {
        $remarks = trim((string) $remarks) ?: null;

        return DB::transaction(function () use ($revision, $decision, $remarks, $actor, $ip) {
            $rev = Revision::query()->whereKey($revision->id)->lockForUpdate()->firstOrFail();
            $user = User::query()->whereKey($rev->user_id)->lockForUpdate()->firstOrFail();

            if ($rev->status !== Revision::STATUS_SUBMITTED) {
                throw ValidationException::withMessages(['decision' => 'Only pending requests can be approved or rejected.']);
            }
            if (! $this->needsApproval($user)) {
                throw ValidationException::withMessages(['decision' => 'This artist registration is not in a reviewable state.']);
            }
            $initial = (int) $user->verified_status === 2;
            $changes = $this->profiles->changesBetween($this->profiles->snapshotFor($user), $rev->snapshot);

            if ($decision === 'approved') {
                $this->profiles->apply($user, $rev->snapshot, $actor->id);
            }
            $rev->update(['status' => $decision, 'decided_by' => $actor->id, 'decided_at' => now(), 'remarks' => $remarks]);

            RevisionEvent::query()->create([
                'revision_id' => $rev->id, 'user_id' => $user->id, 'actor_id' => $actor->id,
                'action' => $decision, 'changes' => $changes, 'remarks' => $remarks, 'ip_address' => $ip,
            ]);

            if ($initial && $decision === 'approved') {
                DB::table('users')->where('id', $user->id)->update(['verified_status' => 1, 'updated_by' => $actor->id, 'updated_at' => now()]);
                DB::table('artist_status_histories')->insert([
                    'user_id' => $user->id, 'registration_type' => (int) $user->role_id, 'old_status' => 2, 'new_status' => 1,
                    'remarks' => $remarks, 'created_by' => $actor->id, 'updated_by' => $actor->id,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            DB::afterCommit(fn () => $this->notifyDecision($user, $rev, $decision, $remarks, $initial));

            return $rev;
        });
    }

    /** Revision #1 = the approved profile, so changes have a starting point. */
    private function ensureBaseline(User $user): void
    {
        if (Revision::query()->where('user_id', $user->id)->exists()) {
            return;
        }
        $rev = Revision::query()->create([
            'user_id' => $user->id, 'registration_type' => (int) $user->role_id, 'revision_number' => 1,
            'status' => Revision::STATUS_APPROVED, 'snapshot' => $this->profiles->snapshotFor($user),
            'decided_at' => now(), 'remarks' => 'Approved profile (starting point for updates).',
        ]);
        RevisionEvent::query()->create(['revision_id' => $rev->id, 'user_id' => $user->id, 'action' => 'baseline']);
    }

    // ------------------------------------------------------------------ emails

    public function artistName(User $user, array $snapshot): string
    {
        $v = $snapshot['values'] ?? [];

        return (string) (($v['group_name'] ?? '') ?: ($v['institution_name'] ?? '') ?: ($v['full_name'] ?? '') ?: $user->full_name);
    }

    private function frontend(string $path): string
    {
        return rtrim((string) config('app.frontend_url'), '/').$path;
    }

    private function notifySubmitted(User $user, Revision $revision, string $label): void
    {
        try {
            $name = $this->artistName($user, $revision->snapshot);
            $status = 'Pending ZCC Review';
            $this->email->send((string) $user->email, ArtistProfileUpdateSubmittedMail::class,
                [$name, $user->regno, (int) $revision->revision_number, $label, $status, $this->frontend('/artist/application'), $revision->submitted_at],
                (bool) config('mail_notifications.artist_profile_submission', true));

            // Only the ZCC(s) whose member States / UTs include the artist's State.
            $reviewers = ZccScope::officialsFor($user)->filter(fn ($u) => filled($u->email))->values();
            if ($reviewers->isEmpty()) {
                Log::warning('No active ZCC official for this artist\'s State / UT to notify about a profile request.', ['revision_id' => $revision->id, 'user_id' => $user->id]);
            }
            $typeLabel = ArtistProfileService::TYPE_LABELS[$revision->snapshot['type'] ?? ''] ?? 'Artist';
            foreach ($reviewers as $officer) {
                $this->email->send((string) $officer->email, ZccArtistProfileActionMail::class, [
                    $officer->full_name ?: 'Nodal Officer', $user->regno, $name, $typeLabel, $label, $status,
                    (int) $revision->revision_number, \App\Support\MailDate::format($revision->submitted_at) ?? '',
                    $this->frontend('/admin/profile-updates/review?id='.$revision->id),
                ], (bool) config('mail_notifications.zcc_profile_action', true));
            }
        } catch (Throwable $e) {
            Log::error('Artist profile submission emails failed', ['revision_id' => $revision->id, 'error' => $e->getMessage()]);
        }
    }

    private function notifyDecision(User $user, Revision $revision, string $decision, ?string $remarks, bool $initial): void
    {
        $name = $this->artistName($user, $revision->snapshot);
        if ($decision === 'approved') {
            $this->email->send((string) $user->email, ArtistProfileApprovedMail::class,
                [$name, $user->regno, $initial, $remarks, $this->frontend('/login'), $revision->decided_at],
                (bool) config('mail_notifications.artist_approval', true));
        } else {
            $this->email->send((string) $user->email, ArtistProfileRejectedMail::class,
                [$name, $user->regno, (string) $remarks, $initial, $this->frontend('/login'), $revision->decided_at],
                (bool) config('mail_notifications.artist_rejection', true));
        }
    }
}
