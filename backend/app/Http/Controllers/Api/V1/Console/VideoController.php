<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\Video;
use App\Traits\UploadAssetTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Videos (CMS): video_type 1 = YouTube URL (stored as the 11-char id),
 * 2 = uploaded MP4. Mirrors Backend\VideoController.
 */
class VideoController extends Controller
{
    use ApiResponse, ConsoleScope, UploadAssetTrait;

    public function index(): JsonResponse
    {
        $items = Video::with('asset')->where('is_deleted', 0)
            ->orderBy('sortorder')->orderByDesc('id')->get()
            ->map(fn (Video $v) => $this->present($v));

        return $this->success(['items' => $items]);
    }

    public function show(int $id): JsonResponse
    {
        return $this->success(['item' => $this->present($this->find($id))]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, null);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->save($request, $this->find($id));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:0,1']]);
        $v = $this->find($id);
        $v->active = (bool) $data['status'];
        $v->updated_by = Auth::id();
        $v->save();

        return $this->success(['status' => (int) $v->active],
            $v->active ? 'Video activated successfully.' : 'Video deactivated successfully.');
    }

    public function destroy(int $id): JsonResponse
    {
        $v = $this->find($id);
        if ($v->assets_id) {
            $this->deleteAssetById($v->assets_id);
        }
        $v->forceFill(['is_deleted' => 1, 'deleted_by' => Auth::id(), 'deleted_at' => now()])->save();

        return $this->success(null, 'Video deleted successfully.');
    }

    private function save(Request $request, ?Video $v): JsonResponse
    {
        $type = (int) $request->input('video_type');
        $data = $request->validate([
            'title'      => ['required', 'string', 'min:3', 'max:255'],
            'video_type' => ['required', 'in:1,2'],
            'video_url'  => ['nullable', 'url', 'max:500', 'required_if:video_type,1'],
            'video'      => [($type === 2 && (!$v || !$v->assets_id)) ? 'required' : 'nullable', 'file', 'mimes:mp4', 'max:10240'],
            'date'       => ['nullable', 'date'],
            'sortorder'  => ['required', 'integer', 'min:0'],
            'status'     => ['required', 'in:0,1'],
        ], [
            'title.required'        => 'Title is required.',
            'video_url.required_if' => 'YouTube URL is required.',
            'video_url.url'         => 'Please enter a valid video URL.',
            'video.required'        => 'MP4 video is required.',
            'video.mimes'           => 'Only MP4 videos are allowed.',
            'video.max'             => 'Video size must not exceed 10MB.',
        ]);

        $youtubeId = null;
        if ($type === 1) {
            $youtubeId = $this->youtubeId($data['video_url']);
            abort_unless($youtubeId, 422, 'Please enter a valid YouTube URL.');
        }

        if ($request->hasFile('video')) {
            $content = file_get_contents($request->file('video')->getRealPath());
            abort_if((bool) preg_match('/<script\b[^>]*>|javascript:/i', (string) $content), 422, 'Invalid video file.');
        }

        $creating = !$v;
        $v ??= new Video(['created_by' => Auth::id(), 'is_deleted' => 0]);
        if (!$creating) {
            $v->updated_by = Auth::id();
        }

        if ($type === 2 && $request->hasFile('video')) {
            $v->assets_id = $v->assets_id
                ? $this->updateAssetInPublic($request->file('video'), $v->assets_id, 'videos')
                : $this->uploadAssetToPublic($request->file('video'), 'videos');
        }
        if ($type === 1 && $v->assets_id) {
            $this->deleteAssetById($v->assets_id);
            $v->assets_id = null;
        }

        // video_type / video_url are not in Video::$fillable.
        $v->forceFill([
            'title'      => $data['title'],
            'video_type' => $type,
            'video_url'  => $youtubeId,
            'date'       => $data['date'] ?? null,
            'sortorder'  => $data['sortorder'],
            'active'     => (bool) $data['status'],
        ])->save();

        return $this->success(['item' => $this->present($v->load('asset'))],
            $creating ? 'Video added successfully.' : 'Video updated successfully.', $creating ? 201 : 200);
    }

    private function youtubeId(?string $url): ?string
    {
        preg_match('/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/', (string) $url, $m);

        return $m[1] ?? null;
    }

    private function find(int $id): Video
    {
        return Video::with('asset')->where('is_deleted', 0)->findOrFail($id);
    }

    private function present(Video $v): array
    {
        $type = (int) $v->video_type;

        return [
            'id'         => $v->id,
            'title'      => $v->title,
            'video_type' => $type,
            'video_url'  => $type === 1 && $v->video_url ? 'https://www.youtube.com/watch?v=' . $v->video_url : null,
            'youtube_id' => $type === 1 ? $v->video_url : null,
            'file_url'   => $this->fileUrl($v->asset?->url),
            'date'       => optional($v->date)->format('Y-m-d'),
            'sortorder'  => $v->sortorder,
            'status'     => (int) $v->active,
        ];
    }
}
