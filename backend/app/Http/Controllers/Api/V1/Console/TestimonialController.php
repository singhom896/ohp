<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\Testimonial;
use App\Traits\UploadAssetTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/** Testimonials (CMS). Mirrors Backend\TestimonialController. */
class TestimonialController extends Controller
{
    use ApiResponse, ConsoleScope, UploadAssetTrait;

    public function index(): JsonResponse
    {
        $items = Testimonial::with('asset')->orderBy('sortorder')->orderByDesc('id')->get()
            ->map(fn (Testimonial $t) => $this->present($t));

        return $this->success(['items' => $items]);
    }

    public function show(int $id): JsonResponse
    {
        return $this->success(['item' => $this->present(Testimonial::with('asset')->findOrFail($id))]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, null);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->save($request, Testimonial::findOrFail($id));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:0,1']]);
        $t = Testimonial::findOrFail($id);
        $t->update(['active' => (bool) $data['status'], 'updated_by' => Auth::id()]);

        return $this->success(['status' => (int) $data['status']],
            $data['status'] ? 'Testimonial activated successfully.' : 'Testimonial deactivated successfully.');
    }

    public function destroy(int $id): JsonResponse
    {
        $t = Testimonial::findOrFail($id);
        if ($t->assets_id) {
            $this->deleteAssetById($t->assets_id);
        }
        $t->delete();

        return $this->success(null, 'Testimonial deleted successfully.');
    }

    private function save(Request $request, ?Testimonial $t): JsonResponse
    {
        $data = $request->validate([
            'name'        => ['required', 'string', 'min:3', 'max:150', 'regex:/^[A-Za-z ]+$/'],
            'age'         => ['nullable', 'integer', 'min:1', 'max:99'],
            'address'     => ['nullable', 'string', 'max:250'],
            'testimonial' => ['required', 'string', 'max:1000'],
            'sortorder'   => ['required', 'integer', 'min:0'],
            'status'      => ['required', 'in:0,1'],
            'photo'       => [$t ? 'nullable' : 'required', 'image', 'mimes:jpg,jpeg,png', 'max:2048', 'dimensions:max_width=400,max_height=400'],
        ], [
            'name.regex'       => 'Name may contain only letters and spaces.',
            'photo.required'   => 'Photo is required.',
            'photo.mimes'      => 'Photo must be JPG, JPEG or PNG.',
            'photo.max'        => 'Photo size must not exceed 2MB.',
            'photo.dimensions' => 'Photo dimensions must not exceed 400x400 pixels.',
        ]);

        $creating = !$t;
        $t ??= new Testimonial(['created_by' => Auth::id()]);
        if (!$creating) {
            $t->updated_by = Auth::id();
        }
        if ($request->hasFile('photo')) {
            $t->assets_id = $t->assets_id
                ? $this->updateAssetInPublic($request->file('photo'), $t->assets_id, 'testimonial')
                : $this->uploadAssetToPublic($request->file('photo'), 'testimonial');
        }
        $t->fill([
            'name'        => $data['name'],
            'age'         => $data['age'] ?? null,
            'address'     => $data['address'] ?? null,
            'testimonial' => $data['testimonial'],
            'sortorder'   => $data['sortorder'],
            'active'      => (bool) $data['status'],
        ])->save();

        return $this->success(['item' => $this->present($t->load('asset'))],
            $creating ? 'Testimonial added successfully.' : 'Testimonial updated successfully.', $creating ? 201 : 200);
    }

    private function present(Testimonial $t): array
    {
        return [
            'id'          => $t->id,
            'name'        => $t->name,
            'age'         => $t->age,
            'address'     => $t->address,
            'testimonial' => $t->testimonial,
            'sortorder'   => $t->sortorder,
            'status'      => (int) $t->active,
            'photo_url'   => $this->fileUrl($t->asset?->url),
        ];
    }
}
