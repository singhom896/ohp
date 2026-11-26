<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Module;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Console modules (sidebar entries + permission keys). Mirrors
 * Backend\ModuleController. `id` is the row id; `module_id` is the business
 * key that permissions reference.
 */
class ModuleController extends Controller
{
    use ApiResponse;

    /** ?parent_id= lists the children of that module_id; omitted = top level. */
    public function index(Request $request): JsonResponse
    {
        $parent = $request->integer('parent_id') ?: null;

        $items = Module::query()
            ->when($parent, fn ($q) => $q->where('parent_id', $parent)->orderBy('position'),
                fn ($q) => $q->whereNull('parent_id')->orderBy('position'))
            ->withCount(['children as children_count'])
            ->get()
            ->map(fn (Module $m) => $this->present($m));

        $parentModule = $parent ? Module::where('module_id', $parent)->first() : null;

        return $this->success([
            'items'  => $items,
            'parent' => $parentModule ? ['module_id' => $parentModule->module_id, 'name' => $parentModule->module_name] : null,
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $m = Module::findOrFail($id);

        return $this->success(['item' => [
            'id' => $m->id, 'moduleid' => $m->module_id, 'parent' => $m->parent_id ? (string) $m->parent_id : '',
            'name' => $m->module_name, 'url' => $m->page_url, 'position' => $m->position,
            'icon' => $m->icon_name, 'status' => (string) (int) $m->active,
        ]]);
    }

    public function options(Request $request): JsonResponse
    {
        $exclude = $request->integer('exclude_id') ?: null;

        return $this->success([
            'parents' => Module::where('active', 1)
                ->where(fn ($q) => $q->whereNull('parent_id')->orWhere('parent_id', 0))
                ->when($exclude, fn ($q) => $q->where('id', '!=', $exclude))
                ->orderBy('module_name')->get(['module_id as id', 'module_name as name']),
            'next_module_id' => (Module::max('module_id') ?? 0) + 1,
            'next_position'  => (Module::max('position') ?? 0) + 1,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, null);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->save($request, Module::findOrFail($id));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'boolean']]);
        $module = Module::with('children')->findOrFail($id);

        abort_if(
            !$data['status'] && $module->children->contains(fn ($c) => $c->active),
            422,
            'Cannot change status. Please deactivate all child modules first.'
        );

        $module->active = (int) $data['status'];
        $module->save();

        return $this->success(['status' => (int) $module->active],
            $module->active ? 'Module activated successfully.' : 'Module deactivated successfully.');
    }

    public function destroy(int $id): JsonResponse
    {
        $module = Module::findOrFail($id);
        abort_if(Module::where('parent_id', $module->module_id)->exists(), 422, 'Module cannot be deleted because it has child modules.');

        DB::transaction(function () use ($module) {
            DB::table('permissions')->where('module_id', $module->module_id)->delete();
            $module->delete();
        });

        return $this->success(null, 'Module deleted successfully.');
    }

    /** Body: { modules: [{ module_id, position }] } */
    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'modules'             => ['required', 'array'],
            'modules.*.module_id' => ['required', 'integer', 'exists:modules,module_id'],
            'modules.*.position'  => ['required', 'integer', 'min:1'],
        ]);

        DB::transaction(function () use ($data) {
            foreach ($data['modules'] as $m) {
                Module::where('module_id', $m['module_id'])->update(['position' => $m['position']]);
            }
        });

        return $this->success(null, 'Module order updated successfully.');
    }

    /** Active top-level modules with active children, for the sorting screen. */
    public function tree(): JsonResponse
    {
        $modules = Module::where('active', 1)
            ->where(fn ($q) => $q->whereNull('parent_id')->orWhere('parent_id', 0))
            ->with('children')
            ->orderBy('position')
            ->get()
            ->map(fn (Module $m) => $this->present($m) + [
                'children' => $m->children->map(fn (Module $c) => $this->present($c))->values()->all(),
            ]);

        return $this->success(['items' => $modules]);
    }

    private function save(Request $request, ?Module $module): JsonResponse
    {
        $data = $request->validate([
            'moduleid' => ['required', 'integer', Rule::unique('modules', 'module_id')->ignore($module?->id)],
            'parent'   => ['nullable', 'integer', 'exists:modules,module_id'],
            'name'     => ['required', 'regex:/^[A-Za-z\s&]+$/'],
            'url'      => ['required', 'string', 'max:255'],
            'position' => ['required', 'integer'],
            'icon'     => ['required', 'string', 'max:100'],
            'status'   => ['required', Rule::in(array_keys(statusoptions()))],
        ], [
            'moduleid.unique' => 'This Module ID is already in use.',
            'name.regex'      => 'Module name can contain letters and spaces only.',
        ]);

        abort_if($module && (int) ($data['parent'] ?? 0) === (int) $data['moduleid'], 422, 'A module cannot be its own parent.');

        $values = [
            'module_id'   => $data['moduleid'],
            'parent_id'   => $data['parent'] ?: null,
            'module_name' => $data['name'],
            'page_url'    => $data['url'],
            'position'    => $data['position'],
            'icon_name'   => $data['icon'],
            'active'      => (int) $data['status'],
        ];

        if ($module) {
            $module->update($values);
            return $this->success(['id' => $module->id], 'Module updated successfully!');
        }

        $module = Module::create($values + ['created_by' => Auth::id()]);

        return $this->success(['id' => $module->id], 'Module created successfully!', 201);
    }

    private function present(Module $m): array
    {
        return [
            'id'             => $m->id,
            'module_id'      => (int) $m->module_id,
            'parent_id'      => $m->parent_id ? (int) $m->parent_id : null,
            'name'           => $m->module_name,
            'url'            => $m->page_url,
            'position'       => (int) $m->position,
            'icon'           => $m->icon_name,
            'status'         => (int) $m->active,
            'children_count' => (int) ($m->children_count ?? 0),
        ];
    }
}
