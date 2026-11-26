<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Public (no login) data for the Next.js website pages linked from the header
 * menu (Administration -> Menus). Same data as the Laravel website pages.
 *
 *   GET /public/art-forms            art form categories + their forms      (/art-forms)
 *   GET /public/documents            bulletin documents, paged + search     (/bulletin)
 *   GET /public/media                albums, videos, event photos/videos    (/gallery)
 *   GET /public/events               upcoming / past events + filters       (/events)
 *   GET /public/events/{id}          one event with its media               (/events/view)
 *   GET /public/artists              approved artists, paged + filters      (/artist-list)
 *   GET /public/artists/{id}         one approved artist's public profile   (/artist-list/view)
 *
 * Only approved artists (users.verified_status = 1) are listed, and no email,
 * mobile number or document is ever returned.
 */
class PublicPagesController extends Controller
{
    use ApiResponse, ConsoleScope; // ConsoleScope for fileUrl() / uploadUrl()

    private const INDIA = 104;

    private const TYPES = [5 => 'individual', 6 => 'group', 7 => 'organisation'];

    private const TYPE_LABELS = [
        'individual'   => 'Individual Artist',
        'group'        => 'Artist Group',
        'organisation' => 'Organisation / Institute',
    ];

    // ------------------------------------------------------------ art forms

    public function artForms(): JsonResponse
    {
        $all = DB::table('art_forms')->where('country_id', self::INDIA)->where('status', 1)->orderBy('name')
            ->get(['id', 'parent_id', 'name', 'description']);
        $children = $all->where('parent_id', '>', 0)->groupBy('parent_id');

        $items = $all->where('parent_id', 0)->values()->map(fn ($f) => [
            'id'          => $f->id,
            'name'        => $f->name,
            'description' => $f->description,
            'forms'       => ($children->get($f->id) ?? collect())->pluck('name')->values(),
        ]);

        return $this->success(['items' => $items]);
    }

    // ------------------------------------------------------------ documents

    public function documents(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search'   => ['nullable', 'string', 'max:100'],
            'sort'     => ['nullable', 'in:asc,desc'],
            'per_page' => ['nullable', 'integer', 'in:10,20,30'],
            'page'     => ['nullable', 'integer', 'min:1'],
        ]);

        $page = DB::table('documents as d')
            ->leftJoin('assets as a', 'a.id', '=', 'd.assets_id')
            ->where('d.active', 1)
            ->where(fn ($q) => $q->whereNull('d.publish_start_date')->orWhere('d.publish_start_date', '<=', now()))
            ->where(fn ($q) => $q->whereNull('d.publish_end_date')->orWhere('d.publish_end_date', '>=', now()))
            ->when($data['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w
                ->where('d.title', 'ilike', '%' . $s . '%')->orWhere('d.description', 'ilike', '%' . $s . '%')))
            ->orderBy(DB::raw('COALESCE(d.publish_start_date, d.created_at)'), $data['sort'] ?? 'desc')
            ->orderByDesc('d.id')
            ->select(['d.id', 'd.title', 'd.description', 'd.document_type', 'd.document_url', 'd.publish_start_date', 'd.created_at', 'a.url as file', 'a.size'])
            ->paginate((int) ($data['per_page'] ?? 10), ['*'], 'page', (int) ($data['page'] ?? 1));

        return $this->success([
            'items' => collect($page->items())->map(fn ($d) => [
                'id'          => $d->id,
                'title'       => $d->title,
                'description' => $d->description,
                'kind'        => (int) $d->document_type === 2 ? 'link' : 'file',
                'url'         => (int) $d->document_type === 2 ? $d->document_url : $this->fileUrl($d->file),
                'extension'   => $d->file ? strtoupper(pathinfo($d->file, PATHINFO_EXTENSION)) : null,
                'size'        => $d->size ? $this->humanSize((int) $d->size) : null,
                'date'        => substr((string) ($d->publish_start_date ?? $d->created_at), 0, 10),
            ])->values(),
            'meta' => $this->meta($page),
        ]);
    }

    // ---------------------------------------------------------------- media

    public function media(): JsonResponse
    {
        $albums = DB::table('galleries as g')->join('assets as a', 'a.id', '=', 'g.assets_id')
            ->where('g.active', 1)->where('g.is_deleted', 0)
            ->orderBy('g.sortorder')->orderByDesc('g.id')
            ->get(['g.id', 'g.title', 'g.location', 'g.date', 'a.url'])
            ->map(fn ($g) => ['id' => $g->id, 'title' => $g->title, 'subtitle' => $g->location, 'date' => $g->date, 'image' => $this->fileUrl($g->url)]);

        $videos = DB::table('videos as v')->leftJoin('assets as a', 'a.id', '=', 'v.assets_id')
            ->where('v.active', 1)->where('v.is_deleted', 0)
            ->orderBy('v.sortorder')->orderByDesc('v.id')
            ->get(['v.id', 'v.title', 'v.video_type', 'v.video_url', 'v.date', 'a.url'])
            ->map(fn ($v) => $this->video((int) $v->id, $v->title, null, (int) $v->video_type === 1 ? $v->video_url : null, $v->url, $v->date))
            ->filter()->values();

        $eventMedia = DB::table('event_media as m')
            ->join('events as e', 'e.id', '=', 'm.event_id')
            ->leftJoin('assets as a', 'a.id', '=', 'm.assets_id')
            ->where('m.is_active', 1)->where('e.is_active', 1)->where('e.is_deleted', 0)
            ->orderByDesc('e.event_date')->orderBy('m.id')
            ->get(['m.id', 'm.media_type', 'm.video_url', 'm.caption', 'e.id as event_id', 'e.title as event_title', 'e.event_date', 'a.url']);

        $eventPhotos = $eventMedia->where('media_type', 'photo')->filter(fn ($m) => $m->url)->values()->map(fn ($m) => [
            'id' => $m->id, 'title' => $m->caption ?: $m->event_title, 'subtitle' => $m->event_title,
            'date' => substr((string) $m->event_date, 0, 10), 'image' => $this->fileUrl($m->url), 'event_id' => $m->event_id,
        ]);
        $eventVideos = $eventMedia->whereIn('media_type', ['video', 'youtube'])->values()
            ->map(fn ($m) => $this->video((int) $m->id, $m->caption ?: $m->event_title, $m->event_title,
                $m->media_type === 'youtube' ? $m->video_url : null, $m->media_type === 'video' ? $m->url : null, substr((string) $m->event_date, 0, 10)))
            ->filter()->values();

        return $this->success(compact('albums', 'videos') + ['event_photos' => $eventPhotos, 'event_videos' => $eventVideos]);
    }

    /** A YouTube video (id or full link) or an uploaded MP4. */
    private function video(int $id, ?string $title, ?string $subtitle, ?string $youtube, ?string $file, $date): ?array
    {
        $ytId = $youtube ? $this->youtubeId($youtube) : null;
        if (! $ytId && ! $file) {
            return null;
        }

        return [
            'id'         => $id,
            'title'      => $title,
            'subtitle'   => $subtitle,
            'date'       => $date ? substr((string) $date, 0, 10) : null,
            'youtube_id' => $ytId,
            'file'       => $ytId ? null : $this->fileUrl($file),
            'thumbnail'  => $ytId ? "https://i.ytimg.com/vi/{$ytId}/hqdefault.jpg" : null,
        ];
    }

    private function youtubeId(string $value): ?string
    {
        $value = trim($value);
        if (preg_match('/^[A-Za-z0-9_-]{11}$/', $value)) {
            return $value;
        }
        if (preg_match('~(?:youtu\.be/|v=|embed/|shorts/)([A-Za-z0-9_-]{11})~', $value, $m)) {
            return $m[1];
        }

        return null;
    }

    // --------------------------------------------------------------- events

    public function events(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type'     => ['nullable', 'in:upcoming,past'],
            'title'    => ['nullable', 'string', 'max:100'],
            'state_id' => ['nullable', 'integer'],
            'city'     => ['nullable', 'string', 'max:100'],
            'date'     => ['nullable', 'date'],
            'page'     => ['nullable', 'integer', 'min:1'],
        ]);
        $type = $data['type'] ?? 'upcoming';

        $base = DB::table('events as e')->where('e.is_active', 1)->where('e.is_deleted', 0);
        $filtered = (clone $base)
            ->when($data['title'] ?? null, fn ($q, $v) => $q->where('e.title', 'ilike', '%' . $v . '%'))
            ->when($data['state_id'] ?? null, fn ($q, $v) => $q->where('e.state_id', $v))
            ->when($data['city'] ?? null, fn ($q, $v) => $q->where(fn ($w) => $w->where('e.city', 'ilike', '%' . $v . '%')
                ->orWhereExists(fn ($s) => $s->selectRaw('1')->from('districts as dd')->whereColumn('dd.id', 'e.district_id')
                    ->where('dd.DistrictName', 'ilike', '%' . $v . '%'))))
            ->when($data['date'] ?? null, fn ($q, $v) => $q->whereDate('e.event_date', $v));

        $page = (clone $filtered)
            ->where('e.event_date', $type === 'upcoming' ? '>=' : '<', now())
            ->leftJoin('states as s', 's.id', '=', 'e.state_id')
            ->leftJoin('districts as d', 'd.id', '=', 'e.district_id')
            ->orderBy('e.event_date', $type === 'upcoming' ? 'asc' : 'desc')
            ->select(['e.*', 's.StateName as state_name', 'd.DistrictName as district_name'])
            ->paginate(9, ['*'], 'page', (int) ($data['page'] ?? 1));

        $covers = $this->eventCovers(collect($page->items())->pluck('id'));

        return $this->success([
            'items'  => collect($page->items())->map(fn ($e) => $this->eventCard($e, $covers->get($e->id)))->values(),
            'meta'   => $this->meta($page),
            'counts' => [
                'upcoming' => (clone $filtered)->where('e.event_date', '>=', now())->count(),
                'past'     => (clone $filtered)->where('e.event_date', '<', now())->count(),
            ],
            'states' => DB::table('states')->orderBy('StateName')->get(['id', 'StateName as name']),
        ]);
    }

    public function event(int $id): JsonResponse
    {
        $e = DB::table('events as e')
            ->leftJoin('states as s', 's.id', '=', 'e.state_id')
            ->leftJoin('districts as d', 'd.id', '=', 'e.district_id')
            ->where('e.id', $id)->where('e.is_active', 1)->where('e.is_deleted', 0)
            ->first(['e.*', 's.StateName as state_name', 'd.DistrictName as district_name']);
        abort_unless($e, 404, 'Event not found.');

        $media = DB::table('event_media as m')->leftJoin('assets as a', 'a.id', '=', 'm.assets_id')
            ->where('m.event_id', $id)->where('m.is_active', 1)->orderBy('m.id')
            ->get(['m.id', 'm.media_type', 'm.video_url', 'm.caption', 'a.url']);

        $photos = $media->where('media_type', 'photo')->filter(fn ($m) => $m->url)->values()
            ->map(fn ($m) => ['id' => $m->id, 'title' => $m->caption, 'image' => $this->fileUrl($m->url)]);
        $videos = $media->whereIn('media_type', ['video', 'youtube'])->values()
            ->map(fn ($m) => $this->video((int) $m->id, $m->caption, null, $m->media_type === 'youtube' ? $m->video_url : null, $m->media_type === 'video' ? $m->url : null, null))
            ->filter()->values();

        return $this->success([
            'item' => $this->eventCard($e, $photos->first()['image'] ?? null) + [
                'description' => (string) $e->event_description,
                'address'     => $e->address,
                'pincode'     => $e->pincode,
            ],
            'photos' => $photos,
            'videos' => $videos,
        ]);
    }

    private function eventCovers(Collection $ids): Collection
    {
        return DB::table('event_media as m')->join('assets as a', 'a.id', '=', 'm.assets_id')
            ->whereIn('m.event_id', $ids)->where('m.is_active', 1)->where('m.media_type', 'photo')
            ->orderBy('m.id')->get(['m.event_id', 'a.url'])
            ->groupBy('event_id')->map(fn ($rows) => $this->fileUrl($rows->first()->url));
    }

    private function eventCard(object $e, ?string $cover): array
    {
        $place = collect([$e->city ?: $e->district_name, $e->state_name])->filter()->unique()->implode(', ');

        return [
            'id'           => $e->id,
            'title'        => $e->title,
            'venue'        => $e->venue,
            'place'        => $place ?: null,
            'organised_by' => $e->organised_by,
            'start_date'   => substr((string) $e->event_date, 0, 10),
            'start_time'   => $e->event_time ? substr((string) $e->event_time, 0, 5) : null,
            'end_date'     => $e->event_end_date ? substr((string) $e->event_end_date, 0, 10) : null,
            'end_time'     => $e->event_end_time ? substr((string) $e->event_end_time, 0, 5) : null,
            'excerpt'      => Str::limit(trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags((string) $e->event_description)))), 150),
            'image'        => $cover,
            'upcoming'     => strtotime((string) $e->event_date) >= time(),
        ];
    }

    // -------------------------------------------------------------- artists

    public function artists(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search'   => ['nullable', 'string', 'max:100'],
            'type'     => ['nullable', 'in:individual,group,organisation'],
            'art_form' => ['nullable', 'integer'],
            'state_id' => ['nullable', 'integer'],
            'page'     => ['nullable', 'integer', 'min:1'],
        ]);

        $query = $this->artistQuery()
            ->when($data['type'] ?? null, fn ($q, $t) => $q->where('u.role_id', array_search($t, self::TYPES, true)))
            ->when($data['state_id'] ?? null, fn ($q, $v) => $q->where('u.state', $v))
            ->when($data['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w
                ->where('u.full_name', 'ilike', "%{$s}%")
                ->orWhere('ar.stage_name', 'ilike', "%{$s}%")
                ->orWhere('ag.group_name', 'ilike', "%{$s}%")
                ->orWhere('ai.institution_name', 'ilike', "%{$s}%")
                ->orWhere('u.city', 'ilike', "%{$s}%")))
            ->when($data['art_form'] ?? null, fn ($q, $id) => $q->where(fn ($w) => $w
                ->where('ar.art_form_id', $id)
                ->orWhereRaw("(',' || COALESCE(ag.art_form_id, '') || ',') LIKE ?", ["%,{$id},%"])
                ->orWhereRaw("(',' || COALESCE(ai.art_form_id, '') || ',') LIKE ?", ["%,{$id},%"])));

        $page = $query->orderByDesc('u.id')->paginate(12, ['*'], 'page', (int) ($data['page'] ?? 1));
        $names = $this->artFormNames();
        $states = DB::table('states')->pluck('StateName', 'id');

        return $this->success([
            'items'     => collect($page->items())->map(fn ($a) => $this->artistCard($a, $names, $states))->values(),
            'meta'      => $this->meta($page),
            'total'     => $this->artistQuery()->count(),
            'art_forms' => DB::table('art_forms')->where('country_id', self::INDIA)->where('status', 1)->where('parent_id', 0)->orderBy('name')->get(['id', 'name']),
            'states'    => DB::table('states')->orderBy('StateName')->get(['id', 'StateName as name']),
            'types'     => collect(self::TYPE_LABELS)->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values(),
        ]);
    }

    public function artist(int $id): JsonResponse
    {
        $a = $this->artistQuery()->where('u.id', $id)->first();
        abort_unless($a, 404, 'Artist not found.');

        $type = self::TYPES[(int) $a->role_id];
        $detail = DB::table(['individual' => 'artist_registrations', 'group' => 'artist_group_details', 'organisation' => 'artist_institution_details'][$type])
            ->where('user_id', $id)->first();
        $names = $this->artFormNames();
        $languageIds = array_filter(array_map('intval', explode(',', (string) ($detail->language_id ?? ''))));

        $links = DB::table('artist_portfolio_links')->where('registration_type', $a->role_id)->where('registration_id', $detail->id)
            ->orderBy('id')->pluck('portfolio_link')->filter(fn ($u) => preg_match('#^https?://#i', $u))->values();
        $awards = DB::table('artist_awards as aw')->leftJoin('art_award_masters as m', 'm.id', '=', 'aw.award_id')
            ->where('aw.registration_type', $a->role_id)->where('aw.registration_id', $detail->id)->orderBy('aw.award_year', 'desc')
            ->get([DB::raw('COALESCE(m.name, aw.award_name) as name'), 'aw.award_year as year', 'aw.description'])
            ->filter(fn ($w) => $w->name)->values();

        $about = match ($type) {
            'individual'   => $detail->biography ?? null,
            'group'        => $detail->group_description ?? null,
            'organisation' => $detail->institution_description ?? null,
        };
        $facts = array_filter(match ($type) {
            'individual' => [
                'Specific Art Form'  => $names[$detail->subgenre_id ?? 0] ?? ($detail->other_subgenre ?? null),
                'Tradition / Style'  => $detail->art_tradition ?? null,
                'Years of Practice'  => isset($detail->years_of_practice) ? $detail->years_of_practice . ' years' : null,
                'Affiliation'        => $detail->institutional_affiliation ?? null,
            ],
            'group' => [
                'Group Type'         => $detail->other_group_type ?: ($detail->group_type ?? null),
                'Members'            => $detail->total_members ?? null,
                'Established'        => $detail->establishment_year ?? null,
            ],
            'organisation' => [
                'Category'           => trim(($detail->institution_type ?? '') . (! empty($detail->sub_category) ? ' — ' . $detail->sub_category : '')) ?: null,
                'Established'        => $detail->establishment_year ?? null,
                'Hosts Programmes'   => isset($detail->hosts_programmes) ? ucfirst($detail->hosts_programmes) : null,
                'Website'            => $detail->website ?? null,
            ],
        }, fn ($v) => $v !== null && $v !== '');

        return $this->success([
            'item' => $this->artistCard($a, $names, DB::table('states')->pluck('StateName', 'id')) + [
                'about'     => $about,
                'facts'     => collect($facts)->map(fn ($v, $k) => ['label' => $k, 'value' => (string) $v])->values(),
                'languages' => $languageIds ? DB::table('art_languages')->whereIn('id', $languageIds)->orderBy('name')->pluck('name') : [],
                'links'     => $links,
                'awards'    => $awards,
            ],
        ]);
    }

    // -------------------------------------------------------- opportunities

    /**
     * Public "Discover Opportunities": live opportunities posted publicly by
     * Engagement Partners. No contact details; artists respond after login.
     */
    public function opportunities(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search'   => ['nullable', 'string', 'max:100'],
            'art_form' => ['nullable', 'integer'],
            'state_id' => ['nullable', 'integer'],
            'page'     => ['nullable', 'integer', 'min:1'],
        ]);
        $page = $this->opportunityQuery()
            ->when($data['art_form'] ?? null, fn ($q, $v) => $q->where('art_form_id', $v))
            ->when($data['state_id'] ?? null, fn ($q, $v) => $q->where('state_id', $v))
            ->when($data['search'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('title', 'ilike', "%{$s}%")->orWhere('city', 'ilike', "%{$s}%")))
            ->orderBy('event_date')->paginate(12, ['*'], 'page', (int) ($data['page'] ?? 1));

        return $this->success([
            'items'     => collect($page->items())->map(fn ($r) => $this->opportunityCard($r))->values(),
            'meta'      => $this->meta($page),
            'art_forms' => DB::table('art_forms')->where('country_id', self::INDIA)->where('status', 1)->where('parent_id', 0)->orderBy('name')->get(['id', 'name']),
            'states'    => DB::table('states')->orderBy('StateName')->get(['id', 'StateName as name']),
        ]);
    }

    public function opportunity(int $id): JsonResponse
    {
        $r = $this->opportunityQuery()->find($id);
        abort_unless($r, 404, 'Opportunity not found or no longer open.');

        return $this->success(['item' => $this->opportunityCard($r) + [
            'description'         => $r->description,
            'artist_requirements' => $r->artist_requirements,
            'performers_needed'   => $r->performers_needed,
            'language'            => $r->language_id ? DB::table('art_languages')->where('id', $r->language_id)->value('name') : null,
            'audience_size'       => $r->audience_size,
            'duration'            => $r->duration,
        ]]);
    }

    private function opportunityQuery()
    {
        return \App\Models\BookingRequirement::query()->whereIn('status', ['open', 'booked'])
            ->where('visibility', 'public')->whereDate('event_date', '>=', now()->toDateString());
    }

    private function opportunityCard(\App\Models\BookingRequirement $r): array
    {
        $p = app(\App\Services\BookingService::class)->partnerInfo($r->organisation_id);

        return [
            'id'            => $r->id,
            'reference'     => $r->reference,
            'title'         => $r->title,
            'category'      => $r->programme_type,
            'organisation'  => $p['name'],
            'organisation_type' => $p['type'],
            'verified'      => $p['verified'],
            'art_form'      => collect([
                $r->art_form_id ? DB::table('art_forms')->where('id', $r->art_form_id)->value('name') : null,
                $r->sub_art_form_id ? DB::table('art_forms')->where('id', $r->sub_art_form_id)->value('name') : null,
            ])->filter()->implode(' – '),
            'artist_type'   => \App\Services\BookingService::ARTIST_TYPES[$r->artist_type] ?? 'Any artist / group / institute',
            'event_date'    => optional($r->event_date)->toDateString(),
            'event_end_date' => optional($r->event_end_date)->toDateString(),
            'event_time'    => $r->event_time,
            'end_time'      => $r->end_time,
            'venue'         => $r->venue,
            'place'         => collect([$r->city, $r->state_id ? DB::table('states')->where('id', $r->state_id)->value('StateName') : null])->filter()->implode(', '),
            'respond_by'    => optional($r->respond_by)->toDateString(),
            'budget'        => $r->budget,
        ];
    }

    /** Approved artists of every type that have their registration details. */
    private function artistQuery()
    {
        return DB::table('users as u')
            ->leftJoin('artist_registrations as ar', fn ($j) => $j->on('ar.user_id', '=', 'u.id')->where('u.role_id', 5))
            ->leftJoin('artist_group_details as ag', fn ($j) => $j->on('ag.user_id', '=', 'u.id')->where('u.role_id', 6))
            ->leftJoin('artist_institution_details as ai', fn ($j) => $j->on('ai.user_id', '=', 'u.id')->where('u.role_id', 7))
            ->leftJoin('art_regions as r', 'r.id', '=', 'u.region_id')
            ->whereIn('u.role_id', [5, 6, 7])
            ->where('u.verified_status', 1)
            ->where(fn ($q) => $q->whereNotNull('ar.id')->orWhereNotNull('ag.id')->orWhereNotNull('ai.id'))
            ->select([
                'u.id', 'u.role_id', 'u.full_name', 'u.city', 'u.state', 'u.regno', 'r.name as region_name',
                'ar.stage_name', 'ar.art_form_id as ar_art_form', 'ar.subgenre_id', 'ar.other_art_form as ar_other', 'ar.profile_photo as ar_photo',
                'ag.group_name', 'ag.art_form_id as ag_art_forms', 'ag.profile_photo as ag_photo',
                'ai.institution_name', 'ai.art_form_id as ai_art_forms', 'ai.institution_logo',
            ]);
    }

    private function artistCard(object $a, Collection $names, Collection $states): array
    {
        $type = self::TYPES[(int) $a->role_id];
        $ids = match ($type) {
            'individual'   => array_filter([(int) $a->ar_art_form]),
            'group'        => array_map('intval', array_filter(explode(',', (string) $a->ag_art_forms))),
            'organisation' => array_map('intval', array_filter(explode(',', (string) $a->ai_art_forms))),
        };
        $name = match ($type) {
            'individual'   => $a->stage_name ?: $a->full_name,
            'group'        => $a->group_name ?: $a->full_name,
            'organisation' => $a->institution_name ?: $a->full_name,
        };
        $photo = match ($type) {
            'individual'   => $a->ar_photo,
            'group'        => $a->ag_photo,
            'organisation' => $a->institution_logo,
        };
        $state = $a->state ? ($states[$a->state] ?? null) : $a->region_name;

        return [
            'id'         => $a->id,
            'name'       => $name,
            'real_name'  => $type === 'individual' && $a->stage_name ? $a->full_name : null,
            'type'       => $type,
            'type_label' => self::TYPE_LABELS[$type],
            'photo'      => $this->uploadUrl($photo),
            'art_forms'  => collect($ids)->map(fn ($id) => $names[$id] ?? null)->filter()->values()
                ->whenEmpty(fn ($c) => $a->ar_other ? collect([$a->ar_other]) : $c),
            'location'   => collect([$a->city, $state])->filter()->unique()->implode(', ') ?: null,
        ];
    }

    private function artFormNames(): Collection
    {
        return DB::table('art_forms')->pluck('name', 'id');
    }

    // -------------------------------------------------------------- helpers

    private function meta($page): array
    {
        return [
            'current_page' => $page->currentPage(),
            'last_page'    => $page->lastPage(),
            'per_page'     => $page->perPage(),
            'total'        => $page->total(),
            'from'         => $page->firstItem(),
            'to'           => $page->lastItem(),
        ];
    }

    private function humanSize(int $bytes): string
    {
        return $bytes >= 1048576 ? round($bytes / 1048576, 1) . ' MB' : max(1, round($bytes / 1024)) . ' KB';
    }
}
