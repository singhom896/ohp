<?php

namespace App\Http\Controllers\Api\V1\Partner;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\BookingMatch;
use App\Models\BookingRequirement as Requirement;
use App\Services\BookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Engagement Partner opportunities (module /requirements, "My Opportunities").
 *
 *   GET    /partner/requirements                       mine (status, search, page) + counts
 *   GET    /partner/requirements/options               form options, contact defaults, can_post
 *   GET    /partner/requirements/match-count           how many artists match the criteria now
 *   GET    /partner/requirements/{id}                  opportunity + linked artists + media
 *   POST   /partner/requirements                       create  { ..., action: draft|publish }
 *   PUT    /partner/requirements/{id}                  update  { ..., action: draft|publish }
 *   POST   /partner/requirements/{id}/status           { action: close|cancel|reopen, reason }
 *   DELETE /partner/requirements/{id}                  drafts only
 *   POST   /partner/requirements/{id}/invite           { artist_ids[], message }  engagement requests
 *   POST   /partner/requirements/{id}/matches/{m}/booking    record a booking confirmed on call / email
 *   PATCH  /partner/requirements/{id}/matches/{m}/booking    { status: completed|cancelled, remarks }
 *   POST   /partner/requirements/{id}/matches/{m}/feedback   { rating 1-5, feedback }
 *   POST   /partner/requirements/{id}/media            photo / video upload or YouTube link
 *   DELETE /partner/requirements/{id}/media/{mediaId}
 */
class RequirementController extends Controller
{
    use ApiResponse, ConsoleScope, PartnerScope;

    public function __construct(private readonly BookingService $bookings) {}

    public function index(Request $request): JsonResponse
    {
        $partner = $this->partner($request);
        $f = $request->validate([
            'status' => ['nullable', Rule::in(array_keys(Requirement::STATUS_LABELS))],
            'search' => ['nullable', 'string', 'max:100'],
            'live'   => ['nullable', 'boolean'],
            'page'   => ['nullable', 'integer', 'min:1'],
        ]);
        $base = Requirement::query()->where('organisation_id', $partner->id)
            ->when($f['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('title', 'ilike', "%{$s}%")->orWhere('reference', 'ilike', "%{$s}%")));
        $counts = (clone $base)->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $q = (clone $base)->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('live'), fn ($q) => $q->whereIn('status', [Requirement::STATUS_OPEN, Requirement::STATUS_BOOKED])->whereDate('event_date', '>=', now()->toDateString()))
            ->orderByRaw("CASE status WHEN 'open' THEN 0 WHEN 'booked' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END")->orderBy('event_date');
        $page = $q->paginate($request->boolean('live') ? 100 : 15, ['*'], 'page', (int) ($f['page'] ?? 1));

        return $this->success([
            'items'    => collect($page->items())->map(fn ($r) => $this->bookings->present($r))->values(),
            'meta'     => self::pageMeta($page),
            'counts'   => collect(Requirement::STATUS_LABELS)->map(fn ($l, $k) => (int) ($counts[$k] ?? 0)),
            'can_post' => $this->canPost($partner),
        ]);
    }

    public function options(Request $request): JsonResponse
    {
        $partner = $this->partner($request);
        $p = $this->profile($partner);

        return $this->success([
            'options'  => $this->bookings->options(),
            'defaults' => [
                'contact_name' => $p->contact_person ?: $partner->full_name, 'contact_mobile' => $p->contact_number ?: $partner->mobile,
                'contact_email' => $p->official_email ?: $partner->email,
                'state_id' => $p->state_id ? (string) $p->state_id : '', 'district_id' => $p->district_id ? (string) $p->district_id : '',
                'city' => $p->city ?? '',
            ],
            'can_post' => $this->canPost($partner),
        ]);
    }

    public function matchCount(Request $request): JsonResponse
    {
        $this->partner($request);
        $c = $request->validate([
            'art_form_id' => ['required', 'integer'], 'sub_art_form_id' => ['nullable', 'integer'],
            'artist_type' => ['nullable', Rule::in(['5', '6', '7'])],
            'language_id' => ['nullable', 'integer'], 'match_scope' => ['required', Rule::in(array_keys(Requirement::SCOPES))],
            'state_id' => ['nullable', 'integer'], 'district_id' => ['nullable', 'integer'],
        ]);

        return $this->success(['count' => $this->bookings->matchCount($c)]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $r = $this->mine($request, $id);

        // Artist contact details are shared once the artist has accepted / said
        // they are interested, or is booked; until then the partner waits for the reply.
        $matches = $this->bookings->matchRows($r)->map(function (array $m) {
            if ($m['interest'] !== 'interested' && $m['booking_status'] === null) {
                $m['email'] = null;
                $m['mobile'] = null;
            }

            return $m;
        });

        return $this->success([
            'requirement' => $this->bookings->present($r),
            'matches'     => $matches,
            'media'       => $this->media($r),
            'editable'    => $this->editable($r),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $partner = $this->partner($request);
        if (! $this->canPost($partner)) {
            return $this->error('Please complete your Organisation Profile before posting opportunities.', 403, 'profile_incomplete');
        }
        $publish = $request->input('action') === 'publish';
        $r = $this->bookings->save($partner, null, $this->bookings->validate($request, $publish), $publish);

        return $this->success($this->bookings->present($r), $this->savedMessage($r, $publish), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $r = $this->mine($request, $id);
        if (! $this->editable($r)) {
            return $this->error('This opportunity can no longer be edited.', 422, 'not_editable');
        }
        $publish = $request->input('action') === 'publish';
        $r = $this->bookings->save($this->partner($request), $r, $this->bookings->validate($request, $publish), $publish);

        return $this->success($this->bookings->present($r), $this->savedMessage($r, $publish));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $r = $this->mine($request, $id);
        $data = $request->validate([
            'action' => ['required', Rule::in(['close', 'cancel', 'reopen'])],
            'reason' => ['nullable', 'string', 'max:1000', Rule::requiredIf(fn () => $request->input('action') === 'cancel')],
        ], ['reason.required' => 'Please give the reason for cancelling; booked artists are informed.']);
        $r = $this->bookings->changeStatus($r, $data['action'], $data['reason'] ?? null, $request->user());

        return $this->success($this->bookings->present($r), match ($data['action']) {
            'close' => 'Opportunity closed. Artists can no longer respond.',
            'cancel' => 'Opportunity cancelled. Booked artists have been informed.',
            default => 'Opportunity reopened.',
        });
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $r = $this->mine($request, $id);
        if ($r->status !== Requirement::STATUS_DRAFT) {
            return $this->error('Only drafts can be deleted. Close or cancel a published opportunity instead.', 422, 'not_draft');
        }
        $r->delete();

        return $this->success(null, 'Draft deleted.');
    }

    public function invite(Request $request, int $id): JsonResponse
    {
        $r = $this->mine($request, $id);
        $data = $request->validate([
            'artist_ids'   => ['required', 'array', 'min:1', 'max:50'],
            'artist_ids.*' => ['integer'],
            'message'      => ['nullable', 'string', 'max:1000'],
        ], ['artist_ids.required' => 'Select at least one artist.']);
        $result = $this->bookings->invite($r, $data['artist_ids'], $data['message'] ?? null);
        $msg = $result['invited']
            ? "Engagement request sent to {$result['invited']} artist(s). They are informed by email and in their dashboard."
            : 'No engagement request was sent.';
        if ($result['skipped']) {
            $msg .= ' '.count($result['skipped']).' could not be invited: '.implode(' ', array_unique(array_values($result['skipped'])));
        }

        return $result['invited']
            ? $this->success($result, $msg)
            : $this->error($msg, 422, 'not_invited', ['artist_ids' => [$msg]]);
    }

    public function book(Request $request, int $id, int $matchId): JsonResponse
    {
        $r = $this->mine($request, $id);
        $m = BookingMatch::query()->where('requirement_id', $r->id)->findOrFail($matchId);
        $data = $request->validate([
            'confirmed_via' => ['required', Rule::in(array_keys(BookingMatch::CONFIRMED_VIA))],
            'confirmed_on'  => ['required', 'date', 'before_or_equal:today'],
            'agreed_fee'    => ['nullable', 'string', 'max:100'],
            'remarks'       => ['nullable', 'string', 'max:2000'],
        ], ['confirmed_on.before_or_equal' => 'The confirmation date cannot be in the future.'], ['confirmed_via' => 'confirmed via', 'confirmed_on' => 'confirmation date']);
        $m = $this->bookings->confirm($m, $data, $request->user());

        return $this->success($this->bookings->matchState($m->fresh()), 'Booking recorded as confirmed. The artist has been informed by email.');
    }

    public function updateBooking(Request $request, int $id, int $matchId): JsonResponse
    {
        $r = $this->mine($request, $id);
        $m = BookingMatch::query()->where('requirement_id', $r->id)->findOrFail($matchId);
        $data = $request->validate([
            'status'  => ['required', Rule::in(['completed', 'cancelled'])],
            'remarks' => ['nullable', 'string', 'max:2000', Rule::requiredIf(fn () => $request->input('status') === 'cancelled')],
        ], ['remarks.required' => 'Please give the reason for cancelling; it is sent to the artist.']);
        $m = $this->bookings->updateBooking($m, $data['status'], $data['remarks'] ?? null);

        return $this->success($this->bookings->matchState($m->fresh()), $data['status'] === 'completed'
            ? 'Booking marked as completed. You can now give feedback and upload event photos / videos.' : 'Booking cancelled. The artist has been informed by email.');
    }

    public function feedback(Request $request, int $id, int $matchId): JsonResponse
    {
        $r = $this->mine($request, $id);
        $m = BookingMatch::query()->where('requirement_id', $r->id)->findOrFail($matchId);
        $data = $request->validate([
            'rating'   => ['required', 'integer', 'between:1,5'],
            'feedback' => ['nullable', 'string', 'max:2000'],
        ]);
        $m = $this->bookings->feedback($m, (int) $data['rating'], $data['feedback'] ?? null);

        return $this->success($this->bookings->matchState($m->fresh()), 'Thank you. Your feedback has been saved and shared with the artist.');
    }

    public function uploadMedia(Request $request, int $id): JsonResponse
    {
        $r = $this->mine($request, $id);
        abort_if($r->status === Requirement::STATUS_DRAFT, 422, 'Publish the opportunity before adding event media.');
        $data = $request->validate([
            'media_type' => ['required', Rule::in(['photo', 'video', 'youtube'])],
            'file'       => ['required_unless:media_type,youtube', 'nullable', 'file',
                $request->input('media_type') === 'video' ? 'mimetypes:video/mp4,video/webm' : 'mimes:jpg,jpeg,png,webp',
                $request->input('media_type') === 'video' ? 'max:51200' : 'max:5120'],
            'url'        => ['required_if:media_type,youtube', 'nullable', 'url:https', 'max:500', 'regex:#^https://(www\.)?(youtube\.com|youtu\.be)/#i'],
            'caption'    => ['nullable', 'string', 'max:255'],
        ], ['url.regex' => 'Enter a YouTube link (https://www.youtube.com/... or https://youtu.be/...).', 'file.max' => 'Photos may be up to 5 MB and videos up to 50 MB.']);
        abort_if(DB::table('booking_media')->where('requirement_id', $r->id)->count() >= 30, 422, 'You can add up to 30 photos / videos per event.');

        DB::table('booking_media')->insert([
            'requirement_id' => $r->id, 'uploaded_by' => $request->user()->id, 'media_type' => $data['media_type'],
            'path' => $data['media_type'] !== 'youtube' ? $request->file('file')->store('event-media', 'public_uploads') : null,
            'url' => $data['media_type'] === 'youtube' ? $data['url'] : null, 'caption' => $data['caption'] ?? null,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $this->success($this->media($r), 'Event media added.', 201);
    }

    public function deleteMedia(Request $request, int $id, int $mediaId): JsonResponse
    {
        $r = $this->mine($request, $id);
        $m = DB::table('booking_media')->where('requirement_id', $r->id)->where('id', $mediaId)->first();
        abort_unless($m, 404);
        DB::table('booking_media')->where('id', $m->id)->delete();
        if ($m->path) {
            Storage::disk('public_uploads')->delete($m->path);
        }

        return $this->success($this->media($r), 'Media removed.');
    }

    // ------------------------------------------------------------------

    /** Media of an opportunity (also used by the artist and admin views). */
    public function media(Requirement $r): array
    {
        return DB::table('booking_media')->where('requirement_id', $r->id)->orderBy('id')->get()
            ->map(fn ($m) => ['id' => $m->id, 'type' => $m->media_type, 'url' => $m->path ? $this->uploadUrl($m->path) : $m->url, 'caption' => $m->caption])
            ->values()->all();
    }

    private function canPost($partner): bool
    {
        return (int) $partner->active === 1 && $this->profile($partner)->completed_at !== null;
    }

    private function editable(Requirement $r): bool
    {
        return in_array($r->status, [Requirement::STATUS_DRAFT, Requirement::STATUS_OPEN, Requirement::STATUS_BOOKED], true)
            && $r->event_date->endOfDay()->isFuture();
    }

    private function savedMessage(Requirement $r, bool $publish): string
    {
        if ($r->status === Requirement::STATUS_DRAFT) {
            return 'Opportunity saved as a draft. Publish it to notify matching artists.';
        }
        if ($r->visibility === 'invite_only') {
            return $publish
                ? 'Opportunity published as invite only. Use Search Artists to send engagement requests.'
                : 'Opportunity updated.';
        }
        $n = $r->matches()->count();

        return $publish
            ? "Opportunity published. {$n} matching artist(s) are being notified by email."
            : "Opportunity updated. Matching artists: {$n}; newly matched artists are notified by email.";
    }
}
