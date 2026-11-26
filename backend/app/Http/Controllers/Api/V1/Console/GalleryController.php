<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\Gallery;
use App\Traits\UploadAssetTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/** Photo gallery (CMS, soft delete via is_deleted). Mirrors Backend\GalleryController. */
class GalleryController extends Controller
{
    use ApiResponse, ConsoleScope, UploadAssetTrait;

    public function index(): JsonResponse
    {
        $items = Gallery::with('asset')->where('is_deleted', 0)
            ->orderBy('sortorder')->orderByDesc('id')->get()
            ->map(fn (Gallery $g) => $this->present($g));

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
        $g = $this->find($id);
        $g->active = (bool) $data['status'];
        $g->updated_by = Auth::id();
        $g->save();

        return $this->success(['status' => (int) $g->active],
            $g->active ? 'Gallery activated successfully.' : 'Gallery deactivated successfully.');
    }

    public function destroy(int $id): JsonResponse
    {
        $g = $this->find($id);
        if ($g->assets_id) {
            $this->deleteAssetById($g->assets_id);
        }
        $g->forceFill(['is_deleted' => 1, 'deleted_by' => Auth::id(), 'deleted_at' => now()])->save();

        return $this->success(null, 'Gallery deleted successfully.');
    }

    private function save(Request $request, ?Gallery $g): JsonResponse
    {
        $data = $request->validate([
            'title'     => ['required', 'string', 'min:3', 'max:255'],
            'location'  => ['nullable', 'string', 'max:150'],
            'video_url' => ['nullable', 'url:http,https', 'max:500'],
            'type'      => ['nullable', 'string', 'max:50'],
            'date'      => ['nullable', 'date'],
            'sortorder' => ['required', 'integer', 'min:0'],
            'status'    => ['required', 'in:0,1'],
            'image'     => [$g ? 'nullable' : 'required', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
        ], [
            'title.required' => 'Title is required.',
            'image.required' => 'Image is required.',
            'image.mimes'    => 'Image must be JPG, JPEG or PNG.',
            'image.max'      => 'Image size must not exceed 2MB.',
        ]);

        $creating = !$g;
        $g ??= new Gallery(['created_by' => Auth::id(), 'is_deleted' => 0]);
        if (!$creating) {
            $g->updated_by = Auth::id();
        }
        if ($request->hasFile('image')) {
            $g->assets_id = $g->assets_id
                ? $this->updateAssetInPublic($request->file('image'), $g->assets_id, 'gallery')
                : $this->uploadAssetToPublic($request->file('image'), 'gallery');
        }
        $g->fill([
            'title'     => $data['title'],
            'location'  => $data['location'] ?? null,
            'video_url' => $data['video_url'] ?? null,
            'type'      => $data['type'] ?? null,
            'date'      => $data['date'] ?? null,
            'sortorder' => $data['sortorder'],
            'active'    => (bool) $data['status'],
        ])->save();

        return $this->success(['item' => $this->present($g->load('asset'))],
            $creating ? 'Gallery added successfully.' : 'Gallery updated successfully.', $creating ? 201 : 200);
    }

    private function find(int $id): Gallery
    {
        return Gallery::with('asset')->where('is_deleted', 0)->findOrFail($id);
    }

    private function present(Gallery $g): array
    {
        return [
            'id'        => $g->id,
            'title'     => $g->title,
            'location'  => $g->location,
            'video_url' => $g->video_url,
            'type'      => $g->type,
            'date'      => optional($g->date)->format('Y-m-d'),
            'sortorder' => $g->sortorder,
            'status'    => (int) $g->active,
            'image_url' => $this->fileUrl($g->asset?->url),
        ];
    }
}
