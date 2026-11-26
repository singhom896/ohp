<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\Banner;
use App\Traits\UploadAssetTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

/** Banners (CMS). Same rules as Backend\BannerController. */
class BannerController extends Controller
{
    use ApiResponse, ConsoleScope, UploadAssetTrait;

    public function index(): JsonResponse
    {
        $items = Banner::with(['asset', 'user.role'])->orderBy('priority_ordering')->get()
            ->map(fn (Banner $b) => $this->present($b));

        return $this->success(['items' => $items]);
    }

    public function show(int $id): JsonResponse
    {
        return $this->success(['item' => $this->present(Banner::with('asset')->findOrFail($id))]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, null);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->save($request, Banner::findOrFail($id));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'boolean']]);
        $banner = Banner::findOrFail($id);
        $banner->active = (int) $data['status'];
        $banner->save();

        return $this->success(['status' => (int) $banner->active],
            $banner->active ? 'Banner activated successfully.' : 'Banner deactivated successfully.');
    }

    public function destroy(int $id): JsonResponse
    {
        $banner = Banner::findOrFail($id);
        if ($banner->assets_id) {
            $this->deleteAssetById($banner->assets_id);
        }
        $banner->delete();

        return $this->success(null, 'Banner and related assets deleted successfully.');
    }

    private function save(Request $request, ?Banner $banner): JsonResponse
    {
        $data = $request->validate([
            'title'    => ['required', 'regex:/^[A-Za-z\s]+$/'],
            'file'     => [$banner ? 'nullable' : 'required', 'image', 'mimes:jpg,jpeg,png', 'max:5120'],
            'ordering' => ['required', 'integer', Rule::unique('banners', 'priority_ordering')->ignore($banner?->id)],
            'status'   => ['required', 'in:' . implode(',', array_keys(statusoptions()))],
        ], [
            'title.required' => 'Banner title is required',
            'title.regex'    => 'Banner title can only contain letters and spaces',
            'file.required'  => 'Please upload a banner image.',
            'file.max'       => 'Please upload a file smaller or equal to 5MB.',
        ]);

        $creating = !$banner;
        $banner ??= new Banner(['created_by' => Auth::id()]);
        $banner->title = $data['title'];
        $banner->priority_ordering = $data['ordering'];
        $banner->active = (int) $data['status'];

        if ($request->hasFile('file')) {
            $banner->assets_id = $banner->assets_id
                ? $this->updateAssetInPublic($request->file('file'), $banner->assets_id, 'images/banners')
                : $this->uploadAssetToPublic($request->file('file'), 'images/banners');
        }
        $banner->save();

        return $this->success(['item' => $this->present($banner->load('asset'))],
            $creating ? 'Banner created successfully' : 'Banner updated successfully!', $creating ? 201 : 200);
    }

    private function present(Banner $b): array
    {
        return [
            'id'         => $b->id,
            'title'      => $b->title,
            'ordering'   => $b->priority_ordering,
            'status'     => (int) $b->active,
            'image_url'  => $this->fileUrl($b->asset?->url),
            'size_mb'    => $b->asset?->size_mb,
            'created_by' => $b->user?->full_name,
            'created_role' => $b->user?->role?->name,
            'created_at' => optional($b->created_at)->toIso8601String(),
        ];
    }
}
