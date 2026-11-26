<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\Minister;
use App\Traits\UploadAssetTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

/** Ministers (CMS). Same rules as Backend\MinisterController. */
class MinisterController extends Controller
{
    use ApiResponse, ConsoleScope, UploadAssetTrait;

    public function index(): JsonResponse
    {
        $items = Minister::with(['asset', 'user.role'])->orderBy('priority_ordering')->get()
            ->map(fn (Minister $m) => $this->present($m));

        return $this->success(['items' => $items]);
    }

    public function show(int $id): JsonResponse
    {
        return $this->success(['item' => $this->present(Minister::with('asset')->findOrFail($id))]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, null);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->save($request, Minister::findOrFail($id));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'boolean']]);
        $minister = Minister::findOrFail($id);
        $minister->active = (int) $data['status'];
        $minister->save();

        return $this->success(['status' => (int) $minister->active],
            $minister->active ? 'Minister activated successfully.' : 'Minister deactivated successfully.');
    }

    public function destroy(int $id): JsonResponse
    {
        $minister = Minister::findOrFail($id);
        if ($minister->assets_id) {
            $this->deleteAssetById($minister->assets_id);
        }
        $minister->delete();

        return $this->success(null, 'Minister and related assets deleted successfully.');
    }

    private function save(Request $request, ?Minister $minister): JsonResponse
    {
        $data = $request->validate([
            'title'       => ['required', 'regex:/^[A-Za-z\s]+$/'],
            'designation' => ['nullable', 'string', 'max:255'],
            'file'        => [$minister ? 'nullable' : 'required', 'image', 'mimes:jpg,jpeg,png', 'max:5120'],
            'ordering'    => ['required', 'integer', Rule::unique('ministers', 'priority_ordering')->ignore($minister?->id)],
            'status'      => ['required', 'in:' . implode(',', array_keys(statusoptions()))],
        ], [
            'title.required' => 'Minister name is required',
            'title.regex'    => 'Minister name can only contain letters and spaces',
            'file.max'       => 'Please upload a file smaller or equal to 5MB.',
        ]);

        $creating = !$minister;
        $minister ??= new Minister(['created_by' => Auth::id()]);
        $minister->name = $data['title'];
        $minister->forceFill(['designation' => $data['designation'] ?? null]);
        $minister->priority_ordering = $data['ordering'];
        $minister->active = (int) $data['status'];

        if ($request->hasFile('file')) {
            $minister->assets_id = $minister->assets_id
                ? $this->updateAssetInPublic($request->file('file'), $minister->assets_id, 'images/ministers')
                : $this->uploadAssetToPublic($request->file('file'), 'images/ministers');
        }
        $minister->save();

        return $this->success(['item' => $this->present($minister->load('asset'))],
            $creating ? 'Minister created successfully' : 'Minister updated successfully!', $creating ? 201 : 200);
    }

    private function present(Minister $m): array
    {
        return [
            'id'          => $m->id,
            'title'       => $m->name,
            'designation' => $m->designation,
            'ordering'    => $m->priority_ordering,
            'status'      => (int) $m->active,
            'image_url'   => $this->fileUrl($m->asset?->url),
            'created_by'  => $m->user?->full_name,
        ];
    }
}
