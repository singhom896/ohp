<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\EventMedia;
use App\Traits\UploadAssetTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Validation\Rule;

/**
 * Events + event media. Mirrors Backend\EventController, with one addition:
 * Nodal Agency users (role 8) only see and change events of their country
 * (the Blade list showed every country's events).
 */
class EventController extends Controller
{
    use ApiResponse, ConsoleScope, UploadAssetTrait;

    private const MEDIA_LIMITS = ['photo' => 50, 'video' => 6, 'youtube' => 6];

    public function index(): JsonResponse
    {
        $items = $this->query()->with(['creator', 'country'])->orderByDesc('id')->get()
            ->map(fn (Event $e) => $this->present($e));

        return $this->success(['items' => $items]);
    }

    public function show(int $id): JsonResponse
    {
        $event = $this->query()->with(['country', 'region', 'media.asset', 'creator'])->findOrFail($id);

        return $this->success([
            'item'  => $this->present($event) + [
                'event_description' => $event->event_description,
                'address'           => $event->address,
                'pincode'           => $event->pincode,
                'mobile'            => $event->mobile,
                'other_mobile'      => $event->other_mobile,
                'email'             => $event->email,
                'region_id'         => $event->region_id,
                'region_name'       => $event->region?->name,
                'lang_id'           => $event->lang_id,
            ],
            'media' => $event->media->map(fn (EventMedia $m) => [
                'id'         => $m->id,
                'media_type' => $m->media_type,
                'caption'    => $m->caption,
                'status'     => (int) $m->is_active,
                'url'        => $m->media_type === 'youtube'
                    ? 'https://www.youtube.com/watch?v=' . $m->video_url
                    : $this->fileUrl($m->asset?->url),
                'youtube_id' => $m->media_type === 'youtube' ? $m->video_url : null,
            ])->values(),
            'media_limits' => self::MEDIA_LIMITS,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, null);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $event = $this->query()->findOrFail($id);
        abort_if($this->hasEnded($event), 422, 'This event has ended and can no longer be edited.');

        return $this->save($request, $event);
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:0,1']]);
        $event = $this->query()->findOrFail($id);
        $event->forceFill(['is_active' => (int) $data['status'], 'updated_by' => Auth::id()])->save();

        return $this->success(['status' => (int) $data['status']], 'Event status updated.');
    }

    public function destroy(int $id): JsonResponse
    {
        $event = $this->query()->findOrFail($id);
        $event->forceFill([
            'is_deleted' => 1, 'deleted_by' => Auth::id(), 'deleted_at' => now(), 'updated_by' => Auth::id(),
        ])->save();

        return $this->success(null, 'Event deleted successfully.');
    }

    /** multipart: media_type=photo|video|youtube, caption, photos[] | videos[] | youtube_url */
    public function uploadMedia(Request $request, int $id): JsonResponse
    {
        $event = $this->query()->findOrFail($id);

        $data = $request->validate([
            'media_type'  => ['required', Rule::in(array_keys(self::MEDIA_LIMITS))],
            'caption'     => ['required', 'string', 'min:3', 'max:250'],
            'photos'      => ['nullable', 'array', 'max:50'],
            'photos.*'    => ['image', 'mimes:jpg,jpeg,png', 'max:2048'],
            'videos'      => ['nullable', 'array', 'max:6'],
            'videos.*'    => ['file', 'mimes:mp4', 'max:10240'],
            'youtube_url' => ['nullable', 'url', 'max:500'],
        ]);

        $type = $data['media_type'];
        $caption = trim($data['caption']);
        $existing = EventMedia::where('event_id', $event->id)->where('media_type', $type)->count();
        $limit = self::MEDIA_LIMITS[$type];

        if ($type === 'youtube') {
            $videoId = $this->youtubeId((string) ($data['youtube_url'] ?? ''));
            abort_unless($videoId, 422, 'Please enter a valid YouTube URL.');
            abort_if($existing >= $limit, 422, "Maximum {$limit} YouTube videos are allowed for one event.");

            EventMedia::create([
                'event_id' => $event->id, 'media_type' => 'youtube', 'video_url' => $videoId,
                'caption' => $caption, 'is_active' => 1, 'created_by' => Auth::id(),
            ]);

            return $this->success(null, 'Event media uploaded successfully.', 201);
        }

        $files = $request->file($type === 'photo' ? 'photos' : 'videos', []);
        abort_if(count($files) < 1, 422, $type === 'photo' ? 'Please select at least one photo.' : 'Please select at least one MP4 video.');
        abort_if($existing + count($files) > $limit, 422, "Maximum {$limit} {$type}s are allowed for one event.");

        DB::transaction(function () use ($files, $event, $type, $caption) {
            foreach ($files as $file) {
                EventMedia::create([
                    'event_id' => $event->id, 'assets_id' => $this->uploadAssetToPublic($file, 'events'),
                    'media_type' => $type, 'caption' => $caption, 'is_active' => 1, 'created_by' => Auth::id(),
                ]);
            }
        });

        return $this->success(null, 'Event media uploaded successfully.', 201);
    }

    public function mediaStatus(Request $request, int $mediaId): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:0,1']]);
        $media = $this->media($mediaId);
        $media->forceFill(['is_active' => (int) $data['status'], 'updated_by' => Auth::id()])->save();

        return $this->success(['status' => (int) $data['status']], 'Media status updated.');
    }

    public function deleteMedia(int $mediaId): JsonResponse
    {
        $media = $this->media($mediaId)->load('asset');

        DB::transaction(function () use ($media) {
            if ($media->asset) {
                $path = public_path($media->asset->url);
                if (File::exists($path)) {
                    File::delete($path);
                }
                $media->asset->delete();
            }
            $media->delete();
        });

        return $this->success(null, 'Media deleted successfully.');
    }

    // ---------------------------------------------------------------------

    private function save(Request $request, ?Event $event): JsonResponse
    {
        $countryId = $this->isNodal() ? $this->requireNodalCountry() : $request->integer('country_id');

        $data = $request->validate([
            'country_id'        => [$this->isNodal() ? 'nullable' : 'required', 'integer'],
            'region_id'         => ['nullable', 'integer', Rule::exists('art_regions', 'id')
                ->where('country_id', $countryId)->where('status', 1)],
            'title'             => ['required', 'string', 'max:255'],
            'venue'             => ['required', 'string', 'max:255'],
            'event_date'        => ['required', 'date_format:Y-m-d'],
            'event_time'        => ['required', 'date_format:H:i'],
            'event_end_date'    => ['required', 'date_format:Y-m-d', 'after_or_equal:event_date'],
            'event_end_time'    => ['required', 'date_format:H:i'],
            'organised_by'      => ['required', 'string', 'max:150'],
            'mobile'            => ['nullable', 'string', 'max:20'],
            'other_mobile'      => ['nullable', 'string', 'max:20'],
            'email'             => ['nullable', 'email', 'max:150'],
            'city'              => ['required', 'string', 'max:255'],
            'pincode'           => ['nullable', 'string', 'max:55'],
            'address'           => ['nullable', 'string', 'max:255'],
            'event_description' => ['required', 'string'],
            'lang_id'           => ['nullable', 'integer', 'min:1'],
            'status'            => ['nullable', 'in:0,1'],
        ], [
            'event_date.required'           => 'Please select the event start date.',
            'event_end_date.required'       => 'Please select the event end date.',
            'event_end_date.after_or_equal' => 'Event end date must be on or after the start date.',
            'region_id.exists'              => 'Please select a valid region for the selected country.',
            'city.required'                 => 'Please enter City / Town.',
        ]);

        if ("{$data['event_end_date']} {$data['event_end_time']}" <= "{$data['event_date']} {$data['event_time']}") {
            return $this->error('Event end date and time must be later than the event start date and time.', 422, 'validation_error', [
                'event_end_time' => ['Event end date and time must be later than the event start date and time.'],
            ]);
        }

        $countryOk = DB::table('countries')->where('id', $countryId)->where('status', 1)->exists();
        if (!$countryOk) {
            return $this->error('Please select a valid active country.', 422, 'validation_error', [
                'country_id' => ['Please select a valid active country.'],
            ]);
        }

        $values = [
            'country_id'        => $countryId,
            'region_id'         => $data['region_id'] ?? null,
            'title'             => $data['title'],
            'venue'             => $data['venue'],
            'city'              => trim($data['city']),
            'event_description' => $data['event_description'],
            'event_date'        => "{$data['event_date']} {$data['event_time']}:00",
            'event_time'        => $data['event_time'],
            'event_end_date'    => $data['event_end_date'],
            'event_end_time'    => $data['event_end_time'],
            'organised_by'      => $data['organised_by'],
            'mobile'            => $data['mobile'] ?? null,
            'other_mobile'      => $data['other_mobile'] ?? null,
            'email'             => $data['email'] ?? null,
            'address'           => $data['address'] ?? null,
            'pincode'           => $data['pincode'] ?? null,
            'lang_id'           => $data['lang_id'] ?? 1,
            'is_active'         => isset($data['status']) ? (int) $data['status'] : ($event ? (int) $event->is_active : 1),
            'updated_by'        => Auth::id(),
        ];

        if ($event) {
            $event->update($values);
            return $this->success(['id' => $event->id], 'Event updated successfully.');
        }

        $event = Event::create($values + ['created_by' => Auth::id(), 'is_deleted' => 0]);

        return $this->success(['id' => $event->id], 'Event created successfully.', 201);
    }

    private function query()
    {
        return Event::query()->where('is_deleted', 0)
            ->when($this->isNodal(), fn ($q) => $q->where('country_id', $this->requireNodalCountry()));
    }

    private function media(int $mediaId): EventMedia
    {
        $media = EventMedia::findOrFail($mediaId);
        $this->query()->findOrFail($media->event_id); // country scope + not deleted

        return $media;
    }

    private function hasEnded(Event $event): bool
    {
        if (empty($event->event_end_date) || empty($event->event_end_time)) {
            return false;
        }

        return Carbon::parse(Carbon::parse($event->event_end_date)->toDateString() . ' ' . $event->event_end_time)->lte(now());
    }

    private function youtubeId(string $url): ?string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $path = trim((string) parse_url($url, PHP_URL_PATH), '/');
        $id = null;

        if (str_contains($host, 'youtu.be')) {
            $id = explode('/', $path)[0] ?? null;
        } elseif (str_contains($host, 'youtube.com') || str_contains($host, 'youtube-nocookie.com')) {
            parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
            if (!empty($query['v'])) {
                $id = $query['v'];
            } elseif (preg_match('~^(embed|shorts|live)/([^/]+)~', $path, $m)) {
                $id = $m[2];
            }
        }

        return ($id && preg_match('/^[A-Za-z0-9_-]{11}$/', $id)) ? $id : null;
    }

    private function present(Event $e): array
    {
        return [
            'id'             => $e->id,
            'title'          => $e->title,
            'venue'          => $e->venue,
            'city'           => $e->city,
            'organised_by'   => $e->organised_by,
            'country_id'     => $e->country_id,
            'country_name'   => $e->country?->name,
            'event_date'     => optional($e->event_date)->format('Y-m-d'),
            'event_time'     => $e->event_time ? substr((string) $e->event_time, 0, 5) : null,
            'event_end_date' => optional($e->event_end_date)->format('Y-m-d'),
            'event_end_time' => $e->event_end_time ? substr((string) $e->event_end_time, 0, 5) : null,
            'status'         => (int) $e->is_active,
            'has_ended'      => $this->hasEnded($e),
            'created_by'     => $e->creator?->full_name,
        ];
    }
}
