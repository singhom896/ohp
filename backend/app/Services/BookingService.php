<?php

namespace App\Services;

use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Jobs\SendBookingNotifications;
use App\Mail\BookingInterestMail;
use App\Mail\BookingMatchMail;
use App\Mail\BookingStatusMail;
use App\Models\BookingMatch;
use App\Models\BookingRequirement as Requirement;
use App\Models\EngagementPartnerProfile;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Opportunities & bookings.
 *
 * Engagement Partners (role 11) post opportunities. A "public" opportunity is
 * matched against artist accounts and every match is emailed; an "invite only"
 * one reaches only the artists the partner sends an engagement request to.
 * Artists reply (interested / accept, or not available / decline); the partner
 * confirms the booking on call or by email and records it, marks it completed,
 * and can leave feedback and upload event photos / videos.
 *
 * Who matches a public opportunity (all must hold):
 *   - Individual Artist (5), Artist Group (6) or Organisation / Institute (7),
 *     as the opportunity asks (or all three);
 *   - account active and registration approved (users.active = 1, verified_status = 1);
 *   - art form: an individual's primary category = the art form (and the specific
 *     art form, when one is asked for); a group / institute lists the art form;
 *   - location: same district / same State / UT / all India (match_scope);
 *   - language, when the opportunity names one.
 *
 * There is no payment of any kind on the platform: "agreed fee" is only a note
 * of what the partner and the artist agreed between themselves.
 */
class BookingService
{
    use ConsoleScope { uploadUrl as public; }

    public const ARTIST_TYPES = [5 => 'Individual Artist', 6 => 'Artist Group', 7 => 'Organisation / Institute'];

    public function __construct(
        private readonly EmailService $email,
        private readonly NotificationService $notifications,
    ) {}

    // ------------------------------------------------------------- options

    public function options(): array
    {
        $artForms = DB::table('art_forms')->where('country_id', ArtistProfileService::INDIA)->where('status', 1)
            ->orderBy('name')->get(['id', 'parent_id', 'name']);

        return [
            'art_forms'       => $artForms->where('parent_id', 0)->values(),
            'sub_art_forms'   => $artForms->where('parent_id', '>', 0)->values(),
            'states'          => DB::table('states')->orderBy('StateName')->get(['id', 'StateName as name']),
            'districts'       => DB::table('districts as d')->join('states as s', 's.StateCode', '=', 'd.StateCode')
                ->orderBy('d.DistrictName')->get(['d.id', 's.id as state_id', 'd.DistrictName as name']),
            'languages'       => DB::table('art_languages')->where('country_id', ArtistProfileService::INDIA)->where('status', 1)->orderBy('name')->get(['id', 'name']),
            'programme_types' => ArtistProfileService::PROGRAMME_TYPES,
            'audience_sizes'  => ArtistProfileService::AUDIENCE_SIZES,
            'artist_types'    => collect(self::ARTIST_TYPES)->map(fn ($l, $v) => ['value' => (string) $v, 'label' => $l])->values(),
            'scopes'          => collect(Requirement::SCOPES)->map(fn ($l, $v) => ['value' => $v, 'label' => $l])->values(),
            'visibility'      => collect(Requirement::VISIBILITY)->map(fn ($l, $v) => ['value' => $v, 'label' => $l])->values(),
        ];
    }

    // ---------------------------------------------------------- validation

    public function validate(Request $request, bool $publishing): array
    {
        $topArtForm = Rule::exists('art_forms', 'id')->where('country_id', ArtistProfileService::INDIA)->where('status', 1)->where('parent_id', 0);
        $stateCode = DB::table('states')->where('id', $request->integer('state_id'))->value('StateCode');
        $today = now()->toDateString();
        // Compare with another date field explicitly (field-name parameters make Carbon warn).
        $other = fn (string $field) => strtotime((string) $request->input($field)) ?: null;
        $notBefore = fn (string $field, string $msg) => function ($attr, $value, $fail) use ($other, $field, $msg) {
            $o = $other($field);
            if ($o && strtotime((string) $value) && strtotime((string) $value) < $o) {
                $fail($msg);
            }
        };
        $notAfter = fn (string $field, string $msg) => function ($attr, $value, $fail) use ($other, $field, $msg) {
            $o = $other($field);
            if ($o && strtotime((string) $value) && strtotime((string) $value) > $o) {
                $fail($msg);
            }
        };

        return $request->validate([
            'title'                   => ['required', 'string', 'max:200'],
            'programme_type'          => ['required', Rule::in(ArtistProfileService::PROGRAMME_TYPES)],
            'art_form_id'             => ['required', 'integer', $topArtForm],
            'sub_art_form_id'         => ['nullable', 'integer', Rule::exists('art_forms', 'id')->where('parent_id', $request->integer('art_form_id'))->where('status', 1)],
            'artist_type'             => ['nullable', Rule::in(array_map('strval', array_keys(self::ARTIST_TYPES)))],
            'language_id'             => ['nullable', 'integer', Rule::exists('art_languages', 'id')->where('country_id', ArtistProfileService::INDIA)->where('status', 1)],
            'performers_needed'       => ['nullable', 'integer', 'min:1', 'max:500'],
            'event_date'              => ['required', 'date', 'after_or_equal:'.$today],
            'event_end_date'          => ['nullable', 'date', $notBefore('event_date', 'The end date cannot be before the event date.')],
            'event_time'              => ['required', 'string', 'max:50'],
            'end_time'                => ['nullable', 'string', 'max:50'],
            'duration'                => ['nullable', 'string', 'max:100'],
            'venue'                   => ['required', 'string', 'max:255'],
            'city'                    => ['required', 'string', 'max:100'],
            'state_id'                => ['required', 'integer', Rule::exists('states', 'id')],
            'district_id'             => ['nullable', 'required_if:match_scope,district', 'integer', Rule::exists('districts', 'id')->where('StateCode', $stateCode ?? -1)],
            'match_scope'             => ['required', Rule::in(array_keys(Requirement::SCOPES))],
            'visibility'              => ['required', Rule::in(array_keys(Requirement::VISIBILITY))],
            'audience_size'           => ['nullable', Rule::in(ArtistProfileService::AUDIENCE_SIZES)],
            'budget'                  => ['nullable', 'string', 'max:150'],
            'description'             => ['required', 'string', 'max:5000'],
            'technical_requirements'  => ['nullable', 'string', 'max:3000'],
            'artist_requirements'     => ['nullable', 'string', 'max:3000'],
            'additional_instructions' => ['nullable', 'string', 'max:3000'],
            'respond_by'              => ['nullable', 'date', 'after_or_equal:'.$today, $notAfter('event_date', 'The last date to respond must be on or before the event date.')],
            'contact_name'            => ['required', 'string', 'max:150'],
            'contact_mobile'          => ['required', 'regex:/^[6-9]\d{9}$/'],
            'contact_email'           => ['required', 'email:rfc', 'max:191'],
        ], [
            'event_date.after_or_equal'  => 'The event date cannot be in the past.',
            'district_id.required_if'    => 'Select the district to match artists from the same district.',
            'district_id.exists'         => 'Select a district of the selected State / UT.',
            'contact_mobile.regex'       => 'Enter a valid 10-digit Indian mobile number.',
        ], [
            'art_form_id' => 'art form', 'sub_art_form_id' => 'specific art form', 'state_id' => 'State / UT',
            'district_id' => 'district', 'respond_by' => 'last date to respond', 'match_scope' => 'artist location',
            'programme_type' => 'event category', 'event_time' => 'start time', 'end_time' => 'end time',
        ]);
    }

    // ------------------------------------------------------------ matching

    /** Artist accounts that may receive opportunities (approved and active). */
    public function eligibleArtists(): Builder
    {
        return DB::table('users as u')->whereIn('u.role_id', array_keys(self::ARTIST_TYPES))
            ->where('u.active', 1)->where('u.verified_status', 1);
    }

    /** Users who fit the criteria (array of requirement columns). */
    public function matchQuery(array $c): Builder
    {
        $af = (int) ($c['art_form_id'] ?? 0);
        $sub = (int) ($c['sub_art_form_id'] ?? 0);
        $lang = (int) ($c['language_id'] ?? 0);
        $types = ! empty($c['artist_type']) ? [(int) $c['artist_type']] : array_keys(self::ARTIST_TYPES);
        $csvHas = fn (string $col, int $id) => ["(',' || REPLACE(COALESCE({$col}, ''), ' ', '') || ',') LIKE ?", ["%,{$id},%"]];

        $q = $this->eligibleArtists()
            ->leftJoin('artist_registrations as ar', 'ar.user_id', '=', 'u.id')
            ->leftJoin('artist_group_details as ag', 'ag.user_id', '=', 'u.id')
            ->leftJoin('artist_institution_details as ai', 'ai.user_id', '=', 'u.id')
            ->whereIn('u.role_id', $types)
            ->where(function ($w) use ($af, $sub, $csvHas) {
                $w->where(function ($i) use ($af, $sub) {
                    $i->where('u.role_id', 5)->where('ar.art_form_id', $af);
                    if ($sub) {
                        $i->where('ar.subgenre_id', $sub);
                    }
                })->orWhere(function ($g) use ($af, $csvHas) {
                    [$sql, $b] = $csvHas('ag.art_form_id', $af);
                    $g->where('u.role_id', 6)->where(fn ($x) => $x->where('ag.primary_art_form_id', $af)->orWhereRaw($sql, $b));
                })->orWhere(function ($o) use ($af, $csvHas) {
                    [$sql, $b] = $csvHas('ai.art_form_id', $af);
                    $o->where('u.role_id', 7)->whereRaw($sql, $b);
                });
            });

        match ($c['match_scope'] ?? 'state') {
            'district' => $q->where('u.district', (int) ($c['district_id'] ?? 0)),
            'india'    => null,
            default    => $q->where('u.state', (int) ($c['state_id'] ?? 0)),
        };

        if ($lang) {
            [$s1, $b1] = $csvHas('ar.language_id', $lang);
            [$s2, $b2] = $csvHas('ag.language_id', $lang);
            [$s3, $b3] = $csvHas('ai.language_id', $lang);
            $q->where(fn ($w) => $w->whereRaw($s1, $b1)->orWhereRaw($s2, $b2)->orWhereRaw($s3, $b3));
        }

        return $q;
    }

    public function matchCount(array $criteria): int
    {
        return $this->matchQuery($criteria)->distinct()->count('u.id');
    }

    /**
     * Public opportunities: adds artists who match now and are not yet linked,
     * then emails them after the response. Artists matched earlier stay linked.
     */
    public function syncMatches(Requirement $r): int
    {
        if ($r->visibility === 'invite_only') {
            return 0;
        }
        $ids = $this->matchQuery($r->only(['art_form_id', 'sub_art_form_id', 'language_id', 'artist_type', 'match_scope', 'state_id', 'district_id']))
            ->distinct()->pluck('u.id');
        $already = DB::table('booking_matches')->where('requirement_id', $r->id)->pluck('artist_id')->flip();
        $new = $ids->reject(fn ($id) => isset($already[$id]))->values();
        $now = now();
        $added = 0;
        foreach ($new->chunk(500) as $chunk) {
            $added += DB::table('booking_matches')->insertOrIgnore($chunk->map(fn ($id) => [
                'requirement_id' => $r->id, 'artist_id' => $id, 'source' => 'matched', 'email_status' => 'pending', 'interest' => 'pending',
                'created_at' => $now, 'updated_at' => $now,
            ])->values()->all());
        }
        if ($added) {
            $this->notifications->notify($new->all(), 'New opportunity: '.$r->title,
                $this->organisationName($r->organisation_id).' is looking for artists like you. Event on '.$this->dateRange($r).'.',
                '/opportunities/view?id='.$r->id);
            DB::afterCommit(fn () => SendBookingNotifications::dispatch($r->id)->afterResponse());
        }

        return $added;
    }

    /** Emails every matched / invited artist not yet told about a live opportunity. */
    public function notifyPending(int $requirementId): array
    {
        $r = Requirement::query()->find($requirementId);
        if (! $r || ! $r->isLive()) {
            return ['sent' => 0, 'failed' => 0];
        }
        $details = $this->mailDetails($r);
        $url = $this->frontendUrl('/artist/opportunities/view?id='.$r->id);
        $sent = $failed = 0;

        BookingMatch::query()->where('requirement_id', $r->id)->where('email_status', 'pending')->with('artist:id,full_name,email,role_id')
            ->chunkById(100, function ($matches) use ($details, $url, &$sent, &$failed) {
                foreach ($matches as $m) {
                    // Claim the row first so overlapping runs never email twice.
                    if (BookingMatch::query()->whereKey($m->id)->where('email_status', 'pending')->update(['email_status' => 'sending', 'updated_at' => now()]) !== 1) {
                        continue;
                    }
                    $ok = $m->artist?->email && $this->email->send($m->artist->email, BookingMatchMail::class, [
                        $this->artistNames([$m->artist_id])[$m->artist_id] ?? $m->artist->full_name, $details, $url,
                        $m->isInvited(), $m->invite_message,
                    ], (bool) config('mail_notifications.booking_match', true));
                    $m->update(['email_status' => $ok ? 'sent' : 'failed', 'notified_at' => $ok ? now() : null, 'email_error' => $ok ? null : 'Email could not be sent.']);
                    $ok ? $sent++ : $failed++;
                }
            });

        return ['sent' => $sent, 'failed' => $failed];
    }

    // ------------------------------------------------------------- actions

    /** Create or update an opportunity; publish = open it and notify matching artists. */
    public function save(User $partner, ?Requirement $r, array $data, bool $publish): Requirement
    {
        return DB::transaction(function () use ($partner, $r, $data, $publish) {
            $data['artist_type'] = ($data['artist_type'] ?? null) ?: null;
            if ($data['match_scope'] !== 'district' && empty($data['district_id'])) {
                $data['district_id'] = null;
            }
            if (! $r) {
                $r = Requirement::query()->create($data + ['organisation_id' => $partner->id, 'reference' => 'TMP-'.Str::random(20), 'status' => Requirement::STATUS_DRAFT]);
                $r->update(['reference' => sprintf('OP-%s-%05d', now()->format('Y'), $r->id)]);
            } else {
                $r->update($data);
            }
            if ($publish && $r->status === Requirement::STATUS_DRAFT) {
                $r->update(['status' => Requirement::STATUS_OPEN, 'published_at' => now()]);
            }
            if (in_array($r->status, [Requirement::STATUS_OPEN, Requirement::STATUS_BOOKED], true)) {
                $this->syncMatches($r);
            }

            return $r->fresh();
        });
    }

    /**
     * Engagement requests: the partner invites chosen artists to a published,
     * live opportunity. Already-linked artists are re-invited (their earlier
     * response is cleared unless they are booked); everyone invited gets an
     * email and an in-app notification.
     *
     * @return array{invited:int, skipped:array<int,string>}
     */
    public function invite(Requirement $r, array $artistIds, ?string $message): array
    {
        if (! $r->isLive()) {
            throw ValidationException::withMessages(['requirement_id' => 'Engagement requests can be sent only for a published opportunity of a future event.']);
        }
        $eligible = $this->eligibleArtists()->whereIn('u.id', $artistIds)->pluck('u.id')->flip();
        $skipped = [];
        $invited = [];

        DB::transaction(function () use ($r, $artistIds, $message, $eligible, &$skipped, &$invited) {
            $now = now();
            foreach (array_unique(array_map('intval', $artistIds)) as $id) {
                if (! isset($eligible[$id])) {
                    $skipped[$id] = 'This artist account is not active or not approved.';
                    continue;
                }
                $m = BookingMatch::query()->where('requirement_id', $r->id)->where('artist_id', $id)->lockForUpdate()->first();
                if ($m && in_array($m->booking_status, ['confirmed', 'completed'], true)) {
                    $skipped[$id] = 'This artist is already booked for this opportunity.';
                    continue;
                }
                $values = [
                    'invited_at' => $now, 'invite_message' => $message, 'interest' => 'pending', 'interest_note' => null,
                    'responded_at' => null, 'booking_status' => null, 'email_status' => 'pending', 'email_error' => null,
                ];
                $m ? $m->update($values) : BookingMatch::query()->create($values + ['requirement_id' => $r->id, 'artist_id' => $id, 'source' => 'invited']);
                $invited[] = $id;
            }
            if ($invited) {
                $this->notifications->notify($invited, 'Engagement request: '.$r->title,
                    $this->organisationName($r->organisation_id).' has invited you to perform on '.$this->dateRange($r).'. Please accept or decline.',
                    '/opportunities/view?id='.$r->id);
                DB::afterCommit(fn () => SendBookingNotifications::dispatch($r->id)->afterResponse());
            }
        });

        return ['invited' => count($invited), 'skipped' => $skipped];
    }

    /** close | cancel | reopen, by the partner or an Admin. */
    public function changeStatus(Requirement $r, string $action, ?string $reason, User $actor): Requirement
    {
        $live = [Requirement::STATUS_OPEN, Requirement::STATUS_BOOKED];
        return DB::transaction(function () use ($r, $action, $reason, $actor, $live) {
            $r = Requirement::query()->lockForUpdate()->findOrFail($r->id);
            if ($action === 'reopen') {
                if ($r->status !== Requirement::STATUS_CLOSED || $r->event_date->endOfDay()->isPast()) {
                    throw ValidationException::withMessages(['action' => 'Only a closed opportunity for a future event can be reopened.']);
                }
                $booked = $r->matches()->where('booking_status', 'confirmed')->exists();
                $r->update(['status' => $booked ? Requirement::STATUS_BOOKED : Requirement::STATUS_OPEN, 'closed_at' => null, 'close_reason' => null, 'closed_by' => null]);

                return $r;
            }
            if (! in_array($r->status, $live, true) && ! ($action === 'cancel' && $r->status === Requirement::STATUS_CLOSED)) {
                throw ValidationException::withMessages(['action' => 'This opportunity is not open.']);
            }
            $r->update([
                'status' => $action === 'cancel' ? Requirement::STATUS_CANCELLED : Requirement::STATUS_CLOSED,
                'closed_at' => now(), 'close_reason' => $reason, 'closed_by' => $actor->id,
            ]);
            if ($action === 'cancel') {
                // Confirmed bookings fall with the event; tell those artists.
                $booked = $r->matches()->where('booking_status', 'confirmed')->get();
                foreach ($booked as $m) {
                    $m->update(['booking_status' => 'cancelled', 'booking_remarks' => 'Event cancelled'.($reason ? ': '.$reason : '.')]);
                    $this->notifications->notify($m->artist_id, 'Booking cancelled: '.$r->title, 'The event has been cancelled.', '/engagement-history');
                    DB::afterCommit(fn () => $this->notifyBooking($m->fresh(), 'cancelled'));
                }
            }

            return $r;
        });
    }

    public function respond(BookingMatch $m, string $interest, ?string $note): BookingMatch
    {
        $r = $m->requirement;
        if (! $r->isLive() || $m->booking_status === 'confirmed' || $m->booking_status === 'completed') {
            throw ValidationException::withMessages(['interest' => 'This opportunity is no longer open for responses.']);
        }
        $changed = $m->interest !== $interest;
        $m->update(['interest' => $interest, 'interest_note' => $note, 'responded_at' => now()]);
        if ($changed) {
            $m = $m->fresh();
            $name = $this->artistNames([$m->artist_id])[$m->artist_id] ?? 'An artist';
            $this->notifications->notify($r->organisation_id, $name.' – '.$m->interestLabel().': '.$r->title, $note, '/requirements/view?id='.$r->id);
            $this->notifyInterest($m);
        }

        return $m;
    }

    /** Partner records a booking confirmed on call / email. */
    public function confirm(BookingMatch $m, array $data, User $actor): BookingMatch
    {
        return DB::transaction(function () use ($m, $data, $actor) {
            $r = Requirement::query()->lockForUpdate()->findOrFail($m->requirement_id);
            if (! $r->isLive()) {
                throw ValidationException::withMessages(['booking' => 'Bookings can be recorded only for an open opportunity of a future event.']);
            }
            if ($m->booking_status === 'confirmed') {
                throw ValidationException::withMessages(['booking' => 'This artist is already booked.']);
            }
            if ($m->interest !== 'interested') {
                throw ValidationException::withMessages(['booking' => $m->interest === 'not_available'
                    ? 'This artist has said they are not available. Send a new engagement request first.'
                    : 'A booking can be recorded once the artist has accepted the request / said they are interested.']);
            }
            $m->update([
                'booking_status' => 'confirmed', 'confirmed_via' => $data['confirmed_via'], 'confirmed_on' => $data['confirmed_on'],
                'agreed_fee' => $data['agreed_fee'] ?? null, 'booking_remarks' => $data['remarks'] ?? null,
                'booked_by' => $actor->id, 'booked_at' => now(),
            ]);
            if ($r->status === Requirement::STATUS_OPEN) {
                $r->update(['status' => Requirement::STATUS_BOOKED]);
            }
            $this->notifications->notify($m->artist_id, 'Booking confirmed: '.$r->title,
                'Your performance on '.$this->dateRange($r).' at '.$r->venue.' is confirmed.', '/performances');
            DB::afterCommit(fn () => $this->notifyBooking($m->fresh(), 'confirmed'));

            return $m;
        });
    }

    /** completed | cancelled for a confirmed booking. */
    public function updateBooking(BookingMatch $m, string $status, ?string $remarks): BookingMatch
    {
        return DB::transaction(function () use ($m, $status, $remarks) {
            if ($m->booking_status !== 'confirmed') {
                throw ValidationException::withMessages(['status' => 'Only a confirmed booking can be updated.']);
            }
            $m->update(['booking_status' => $status, 'booking_remarks' => $remarks ?: $m->booking_remarks]);
            $r = Requirement::query()->lockForUpdate()->findOrFail($m->requirement_id);
            if ($status === 'cancelled') {
                if ($r->status === Requirement::STATUS_BOOKED && ! $r->matches()->whereIn('booking_status', ['confirmed', 'completed'])->exists()) {
                    $r->update(['status' => Requirement::STATUS_OPEN]);
                }
                $this->notifications->notify($m->artist_id, 'Booking cancelled: '.$r->title, $remarks, '/engagement-history');
                DB::afterCommit(fn () => $this->notifyBooking($m->fresh(), 'cancelled'));
            } else {
                $this->notifications->notify($m->artist_id, 'Performance completed: '.$r->title, 'The organiser marked your performance as completed.', '/engagement-history');
            }

            return $m;
        });
    }

    /** Partner feedback on a completed performance (shown in the artist's history). */
    public function feedback(BookingMatch $m, int $rating, ?string $feedback): BookingMatch
    {
        if ($m->booking_status !== 'completed') {
            throw ValidationException::withMessages(['rating' => 'Feedback can be given only for a completed performance.']);
        }
        $m->update(['rating' => $rating, 'feedback' => $feedback, 'feedback_at' => now()]);
        $this->notifications->notify($m->artist_id, 'New feedback on your performance', $m->requirement->title.' – rated '.$rating.'/5.', '/engagement-history');

        return $m;
    }

    // ------------------------------------------------------- presentation

    /** Opportunity as JSON (names resolved). */
    public function present(Requirement $r): array
    {
        $stats = DB::table('booking_matches')->where('requirement_id', $r->id)
            ->selectRaw("COUNT(*) as matched")
            ->selectRaw("SUM(CASE WHEN email_status = 'sent' THEN 1 ELSE 0 END) as notified")
            ->selectRaw("SUM(CASE WHEN invited_at IS NOT NULL THEN 1 ELSE 0 END) as invited")
            ->selectRaw("SUM(CASE WHEN interest = 'interested' THEN 1 ELSE 0 END) as interested")
            ->selectRaw("SUM(CASE WHEN interest = 'not_available' THEN 1 ELSE 0 END) as declined")
            ->selectRaw("SUM(CASE WHEN booking_status IN ('confirmed', 'completed') THEN 1 ELSE 0 END) as booked")
            ->first();
        $partner = $this->partnerInfo($r->organisation_id);

        return [
            'id' => $r->id, 'reference' => $r->reference, 'title' => $r->title, 'programme_type' => $r->programme_type,
            'status' => $r->status, 'status_label' => Requirement::STATUS_LABELS[$r->status] ?? $r->status,
            'live' => $r->isLive(),
            'organisation' => $partner['name'], 'organisation_type' => $partner['type'], 'organisation_verified' => $partner['verified'],
            'art_form_id' => $r->art_form_id, 'sub_art_form_id' => $r->sub_art_form_id,
            'art_form' => $this->name('art_forms', 'name', $r->art_form_id), 'sub_art_form' => $this->name('art_forms', 'name', $r->sub_art_form_id),
            'artist_type' => $r->artist_type, 'artist_type_label' => self::ARTIST_TYPES[$r->artist_type] ?? 'Any artist / group / institute',
            'language_id' => $r->language_id, 'language' => $this->name('art_languages', 'name', $r->language_id),
            'performers_needed' => $r->performers_needed,
            'event_date' => optional($r->event_date)->toDateString(), 'event_end_date' => optional($r->event_end_date)->toDateString(),
            'event_time' => $r->event_time, 'end_time' => $r->end_time, 'duration' => $r->duration, 'venue' => $r->venue, 'city' => $r->city,
            'state_id' => $r->state_id, 'district_id' => $r->district_id,
            'state' => $this->name('states', 'StateName', $r->state_id), 'district' => $this->name('districts', 'DistrictName', $r->district_id),
            'match_scope' => $r->match_scope, 'match_scope_label' => Requirement::SCOPES[$r->match_scope] ?? $r->match_scope,
            'visibility' => $r->visibility ?: 'public', 'visibility_label' => Requirement::VISIBILITY[$r->visibility ?: 'public'] ?? null,
            'audience_size' => $r->audience_size, 'budget' => $r->budget, 'description' => $r->description,
            'technical_requirements' => $r->technical_requirements, 'artist_requirements' => $r->artist_requirements,
            'additional_instructions' => $r->additional_instructions, 'respond_by' => optional($r->respond_by)->toDateString(),
            'contact_name' => $r->contact_name, 'contact_mobile' => $r->contact_mobile, 'contact_email' => $r->contact_email,
            'published_at' => optional($r->published_at)->toIso8601String(), 'closed_at' => optional($r->closed_at)->toIso8601String(),
            'close_reason' => $r->close_reason, 'created_at' => optional($r->created_at)->toIso8601String(),
            'stats' => [
                'matched' => (int) ($stats->matched ?? 0), 'notified' => (int) ($stats->notified ?? 0), 'invited' => (int) ($stats->invited ?? 0),
                'interested' => (int) ($stats->interested ?? 0), 'declined' => (int) ($stats->declined ?? 0), 'booked' => (int) ($stats->booked ?? 0),
            ],
        ];
    }

    /** Linked artists of an opportunity with contact, response and booking. */
    public function matchRows(Requirement $r, ?string $filter = null): Collection
    {
        $q = BookingMatch::query()->where('requirement_id', $r->id)
            ->when($filter === 'interested', fn ($w) => $w->where('interest', 'interested'))
            ->when($filter === 'booked', fn ($w) => $w->whereNotNull('booking_status'))
            ->orderByRaw("CASE WHEN booking_status = 'confirmed' THEN 0 WHEN booking_status = 'completed' THEN 1 WHEN interest = 'interested' THEN 2 WHEN invited_at IS NOT NULL AND interest = 'pending' THEN 3 WHEN interest = 'pending' THEN 4 ELSE 5 END")
            ->orderBy('id')->limit(1000)->get();
        $info = $this->artistInfo($q->pluck('artist_id')->all());

        return $q->map(fn (BookingMatch $m) => ($info[$m->artist_id] ?? ['id' => $m->artist_id, 'name' => '—']) + $this->matchState($m))->values();
    }

    public function matchState(BookingMatch $m): array
    {
        return [
            'match_id' => $m->id, 'source' => $m->source ?: 'matched', 'invited' => $m->isInvited(),
            'invited_at' => optional($m->invited_at)->toIso8601String(), 'invite_message' => $m->invite_message,
            'email_status' => $m->email_status, 'notified_at' => optional($m->notified_at)->toIso8601String(),
            'interest' => $m->interest, 'interest_label' => $m->interestLabel(),
            'interest_note' => $m->interest_note, 'responded_at' => optional($m->responded_at)->toIso8601String(),
            'booking_status' => $m->booking_status, 'booking_label' => BookingMatch::BOOKING_LABELS[$m->booking_status] ?? null,
            'confirmed_via' => $m->confirmed_via, 'confirmed_via_label' => BookingMatch::CONFIRMED_VIA[$m->confirmed_via] ?? null,
            'confirmed_on' => optional($m->confirmed_on)->toDateString(), 'agreed_fee' => $m->agreed_fee,
            'booking_remarks' => $m->booking_remarks, 'booked_at' => optional($m->booked_at)->toIso8601String(),
            'saved' => $m->saved_at !== null, 'rating' => $m->rating, 'feedback' => $m->feedback,
            'feedback_at' => optional($m->feedback_at)->toIso8601String(),
        ];
    }

    /** id => [name, type, regno, email, mobile, location, art_forms, photo] for artist accounts (5, 6, 7). */
    public function artistInfo(array $ids): array
    {
        if (! $ids) {
            return [];
        }
        $rows = DB::table('users as u')
            ->leftJoin('artist_registrations as ar', 'ar.user_id', '=', 'u.id')
            ->leftJoin('artist_group_details as ag', 'ag.user_id', '=', 'u.id')
            ->leftJoin('artist_institution_details as ai', 'ai.user_id', '=', 'u.id')
            ->leftJoin('states as s', 's.id', '=', 'u.state')
            ->leftJoin('districts as d', 'd.id', '=', 'u.district')
            ->whereIn('u.id', $ids)
            ->get(['u.id', 'u.role_id', 'u.regno', 'u.email', 'u.mobile', 'u.full_name', 'u.account_name', 'u.city', 'u.verified_status',
                'ar.stage_name', 'ag.group_name', 'ai.institution_name',
                'ar.art_form_id as ind_art', 'ar.subgenre_id', 'ag.art_form_id as grp_art', 'ai.art_form_id as org_art',
                'ar.profile_photo as ind_photo', 'ag.profile_photo as grp_photo', 'ai.institution_logo as org_photo',
                's.StateName as state_name', 'd.DistrictName as district_name']);
        $artNames = DB::table('art_forms')->pluck('name', 'id');
        $csv = fn ($v) => array_filter(array_map('intval', explode(',', (string) $v)));
        $out = [];
        foreach ($rows as $a) {
            $role = (int) $a->role_id;
            $artIds = match ($role) {
                6 => $csv($a->grp_art),
                7 => $csv($a->org_art),
                default => array_filter([(int) $a->ind_art, (int) $a->subgenre_id]),
            };
            $out[$a->id] = [
                'id' => $a->id,
                'name' => match ($role) {
                    6 => $a->group_name ?: ($a->account_name ?: $a->full_name),
                    7 => $a->institution_name ?: ($a->account_name ?: $a->full_name),
                    default => $a->stage_name ? "{$a->full_name} ({$a->stage_name})" : $a->full_name,
                },
                'role_id' => $role, 'type' => self::ARTIST_TYPES[$role] ?? '—', 'regno' => $a->regno, 'email' => $a->email, 'mobile' => $a->mobile,
                'accredited' => (int) $a->verified_status === 1,
                'location' => collect([$a->city, $a->district_name, $a->state_name])->filter()->unique()->implode(', '),
                'art_forms' => collect($artIds)->map(fn ($id) => $artNames[$id] ?? null)->filter()->values(),
                'photo' => $this->uploadUrl(match ($role) { 6 => $a->grp_photo, 7 => $a->org_photo, default => $a->ind_photo }),
            ];
        }

        return $out;
    }

    public function artistNames(array $ids): array
    {
        return collect($this->artistInfo($ids))->map(fn ($a) => $a['name'])->all();
    }

    /** Name, type and verification of the account that posted an opportunity. */
    public function partnerInfo(int $userId): array
    {
        $p = EngagementPartnerProfile::query()->where('user_id', $userId)->first(['organisation_name', 'partner_type', 'verified_at']);
        if ($p) {
            return ['name' => $p->organisation_name, 'type' => $p->partner_type, 'verified' => $p->verified_at !== null];
        }

        // Opportunities posted by role 7 accounts before Engagement Partners existed.
        return ['name' => (string) (DB::table('artist_institution_details')->where('user_id', $userId)->value('institution_name')
            ?: DB::table('users')->where('id', $userId)->value('full_name')), 'type' => null, 'verified' => false];
    }

    public function organisationName(int $userId): string
    {
        return $this->partnerInfo($userId)['name'];
    }

    // --------------------------------------------------------------- emails

    private function notifyInterest(BookingMatch $m): void
    {
        if ($m->interest !== 'interested') {
            return;
        }
        $r = $m->requirement;
        $a = $this->artistInfo([$m->artist_id])[$m->artist_id] ?? null;
        if (! $a) {
            return;
        }
        $to = collect([$r->contact_email, DB::table('users')->where('id', $r->organisation_id)->value('email')])->filter()->unique();
        foreach ($to as $email) {
            $this->email->send($email, BookingInterestMail::class, [
                $r->contact_name, $a['name'], $a['type'], $a['email'], $a['mobile'], $m->interest_note,
                ['Opportunity' => $r->title, 'Reference' => $r->reference, 'Event date' => $this->dateRange($r), 'Response' => $m->interestLabel()],
                $this->frontendUrl('/partner/requirements/view?id='.$r->id),
            ], (bool) config('mail_notifications.booking_interest', true));
        }
    }

    private function notifyBooking(BookingMatch $m, string $status): void
    {
        $r = $m->requirement;
        $artist = User::query()->find($m->artist_id);
        if (! $artist?->email) {
            return;
        }
        $details = $this->mailDetails($r);
        if ($status === 'confirmed') {
            $details += [
                'Confirmed via' => BookingMatch::CONFIRMED_VIA[$m->confirmed_via] ?? null,
                'Confirmed on' => optional($m->confirmed_on)->format('d M Y'),
                'Agreed fee (between you and the organiser)' => $m->agreed_fee,
            ];
        }
        $this->email->send($artist->email, BookingStatusMail::class, [
            $this->artistNames([$artist->id])[$artist->id] ?? $artist->full_name, $status, $details, $m->booking_remarks,
            $this->frontendUrl('/artist/opportunities/view?id='.$r->id),
        ], (bool) config('mail_notifications.booking_status', true));
    }

    /** Label => value rows for the emails. */
    public function mailDetails(Requirement $r): array
    {
        return [
            'Requirement' => $r->title,
            'Reference' => $r->reference,
            'Organised by' => $this->organisationName($r->organisation_id),
            'Event category' => $r->programme_type,
            'Art form' => collect([$this->name('art_forms', 'name', $r->art_form_id), $this->name('art_forms', 'name', $r->sub_art_form_id)])->filter()->implode(' – '),
            'Event date' => $this->dateRange($r).($r->event_time ? ', '.$r->event_time.($r->end_time ? ' – '.$r->end_time : '') : ''),
            'Venue' => collect([$r->venue, $r->city, $this->name('districts', 'DistrictName', $r->district_id), $this->name('states', 'StateName', $r->state_id)])->filter()->unique()->implode(', '),
            'Honorarium / budget' => $r->budget,
            'Respond by' => optional($r->respond_by)->format('d M Y'),
            'Contact' => trim($r->contact_name.' · '.$r->contact_mobile.' · '.$r->contact_email, ' ·'),
        ];
    }

    public function dateRange(Requirement $r): string
    {
        $from = optional($r->event_date)->format('d M Y');
        $to = optional($r->event_end_date)->format('d M Y');

        return $to && $to !== $from ? "{$from} – {$to}" : (string) $from;
    }

    private function name(string $table, string $col, $id): ?string
    {
        return $id ? DB::table($table)->where('id', (int) $id)->value($col) : null;
    }

    public function frontendUrl(string $path): string
    {
        return rtrim((string) config('app.frontend_url', config('app.url')), '/').$path;
    }
}
