<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\MenuItem;
use App\Traits\UploadAssetTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * CMS documents: PDF upload (document_type 1) or external URL (2), attached
 * to a "Document" type menu item. Same rules as Backend\DocumentController.
 */
class DocumentController extends Controller
{
    use ApiResponse, ConsoleScope, UploadAssetTrait;

    public const TYPES = [1 => 'PDF Upload', 2 => 'External URL'];

    public function index(): JsonResponse
    {
        $items = Document::with(['asset', 'menuItem', 'user.role'])->orderByDesc('id')->get()
            ->map(fn (Document $d) => $this->present($d));

        return $this->success(['items' => $items]);
    }

    public function show(int $id): JsonResponse
    {
        return $this->success(['item' => $this->present(Document::with('asset')->findOrFail($id))]);
    }

    public function options(): JsonResponse
    {
        return $this->success([
            'menus'          => MenuItem::where('type', 3)->where('active', 1)->orderBy('title')->get(['id', 'title']),
            'document_types' => self::TYPES,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, null);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->save($request, Document::findOrFail($id));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'boolean']]);
        $doc = Document::findOrFail($id);
        $doc->active = (bool) $data['status'];
        $doc->save();

        return $this->success(['status' => (int) $doc->active],
            $doc->active ? 'Document activated successfully.' : 'Document deactivated successfully.');
    }

    public function destroy(int $id): JsonResponse
    {
        $doc = Document::findOrFail($id);
        if ($doc->assets_id) {
            $this->deleteAssetById($doc->assets_id);
        }
        $doc->delete();

        return $this->success(null, 'Document and related assets deleted successfully.');
    }

    private function save(Request $request, ?Document $document): JsonResponse
    {
        $type = (int) $request->input('document_type');
        $rules = [
            'title'              => ['required', 'regex:/^[A-Za-z0-9\s.\-_]+$/'],
            'description'        => ['nullable', 'string'],
            'menu'               => ['required', 'integer', 'exists:menu_items,id'],
            'document_type'      => ['required', 'integer', 'in:1,2'],
            'publish_start_date' => ['required', 'date_format:Y-m-d\\TH:i'],
            'publish_end_date'   => ['required', 'date_format:Y-m-d\\TH:i', 'after_or_equal:publish_start_date'],
            'status'             => ['required', 'in:0,1'],
        ];
        if ($type === 1) {
            $rules['file'] = [(!$document || !$document->assets_id) ? 'required' : 'nullable', 'file', 'mimes:pdf', 'max:10240'];
        } elseif ($type === 2) {
            $rules['document_url'] = ['required', 'url', 'max:555'];
        }

        $data = $request->validate($rules, [
            'title.required'                  => 'Document title is required.',
            'title.regex'                     => 'The title may only contain letters, numbers, spaces, dots, hyphens, and underscores.',
            'menu.required'                   => 'Please select Menu.',
            'document_type.required'          => 'Please select Document Type.',
            'file.required'                   => 'Please upload a PDF document.',
            'file.mimes'                      => 'Only PDF files are allowed.',
            'file.max'                        => 'Please upload a file smaller than or equal to 10MB.',
            'document_url.required'           => 'Please enter Document URL.',
            'document_url.url'                => 'Please enter a valid URL.',
            'publish_start_date.required'     => 'Please select Publish Start Date.',
            'publish_end_date.required'       => 'Please select Publish End Date.',
            'publish_end_date.after_or_equal' => 'Publish End Date must be after or equal to Publish Start Date.',
        ]);

        $menu = MenuItem::where('id', $data['menu'])->where('type', 3)->where('active', 1)->first();
        abort_unless($menu, 422, 'Invalid Menu selected.');

        $creating = !$document;
        $oldAssetId = $document?->assets_id;
        $document ??= new Document(['created_by' => Auth::id()]);
        if (!$creating) {
            $document->updated_by = Auth::id();
        }

        $document->fill([
            'title'              => trim($data['title']),
            'description'        => $data['description'] ?? null,
            'parent_menu_id'     => $menu->id,
            'document_type'      => $type,
            'publish_start_date' => $data['publish_start_date'],
            'publish_end_date'   => $data['publish_end_date'],
            'active'             => (bool) $data['status'],
        ]);

        if ($type === 1) {
            $document->document_url = null;
            if ($request->hasFile('file')) {
                $document->assets_id = $oldAssetId
                    ? $this->updateAssetInPublic($request->file('file'), $oldAssetId, 'documents')
                    : $this->uploadAssetToPublic($request->file('file'), 'documents');
            }
        } else {
            $document->document_url = trim($data['document_url']);
            $document->assets_id = null;
        }
        $document->save();

        if ($type === 2 && $oldAssetId) {
            $this->deleteAssetById($oldAssetId);
        }

        return $this->success(['item' => $this->present($document->load('asset'))],
            $creating ? 'Document created successfully!' : 'Document updated successfully!', $creating ? 201 : 200);
    }

    private function present(Document $d): array
    {
        return [
            'id'                 => $d->id,
            'title'              => $d->title,
            'description'        => $d->description,
            'menu'               => $d->parent_menu_id,
            'menu_title'         => $d->menuItem?->title,
            'document_type'      => (int) $d->document_type,
            'document_type_label'=> self::TYPES[(int) $d->document_type] ?? '—',
            'document_url'       => $d->document_url,
            'file_url'           => $this->fileUrl($d->asset?->url),
            'size_mb'            => $d->asset?->size_mb,
            'publish_start_date' => optional($d->publish_start_date)->format('Y-m-d\TH:i'),
            'publish_end_date'   => optional($d->publish_end_date)->format('Y-m-d\TH:i'),
            'status'             => (int) $d->active,
            'created_by'         => $d->user?->full_name,
        ];
    }
}
