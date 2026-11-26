<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\MenuItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Public website menus (menu_items). Mirrors Backend\MenuController. */
class MenuController extends Controller
{
    use ApiResponse;

    /** Filters: ?parent_id=&status=&page_type=&type= (1 main, 2 footer, 3 both) */
    public function index(Request $request): JsonResponse
    {
        $parent = $request->integer('parent_id') ?: null;

        $items = MenuItem::query()
            ->when($parent, fn ($q) => $q->where('parent_id', $parent), fn ($q) => $q->whereNull('parent_id'))
            ->with(['user.role', 'parent'])
            ->withCount('children')
            ->when($request->filled('status'), fn ($q) => $q->where('active', $request->integer('status')))
            ->when($request->filled('page_type'), fn ($q) => $q->where('type', $request->integer('page_type')))
            ->menuType($request->integer('type') ?: null)
            ->orderBy('order_index')
            ->get()
            ->map(fn (MenuItem $m) => $this->present($m));

        $parentMenu = $parent ? MenuItem::find($parent) : null;

        return $this->success([
            'items'  => $items,
            'parent' => $parentMenu ? ['id' => $parentMenu->id, 'title' => $parentMenu->title] : null,
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $m = MenuItem::findOrFail($id);

        return $this->success(['item' => [
            'id' => $m->id, 'title' => $m->title, 'url' => $m->url, 'parent' => $m->parent_id ? (string) $m->parent_id : '',
            'target' => $m->target, 'page_type' => (string) $m->type, 'menu_type' => (string) ($m->menu_type ?? ''),
            'ordering' => $m->order_index, 'status' => (string) (int) $m->active,
        ]]);
    }

    public function options(Request $request): JsonResponse
    {
        $exclude = $request->integer('exclude_id') ?: null;

        return $this->success([
            'parents'     => MenuItem::when($exclude, fn ($q) => $q->where('id', '!=', $exclude))
                ->orderBy('title')->get(['id', 'title']),
            'page_type'   => pagetype(),
            'target_type' => targettype(),
            'menu_type'   => MenuItem::menuTypeOptions(),
            'status'      => statusoptions(),
            'next_order'  => (MenuItem::max('order_index') ?? 0) + 1,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, null);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->save($request, MenuItem::findOrFail($id));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'boolean']]);
        $menu = MenuItem::with('childrenRecursive')->findOrFail($id);

        abort_if(
            !$data['status'] && $menu->childrenRecursive->contains(fn ($c) => $c->active),
            422,
            'Cannot change status. Please deactivate all child menus first.'
        );

        $menu->active = (bool) $data['status'];
        $menu->save();

        return $this->success(['status' => (int) $menu->active],
            $menu->active ? 'Menu activated successfully.' : 'Menu deactivated successfully.');
    }

    public function destroy(int $id): JsonResponse
    {
        $menu = MenuItem::findOrFail($id);
        abort_if(MenuItem::where('parent_id', $menu->id)->exists(), 422, 'Menu cannot be deleted because it has child menus.');
        $menu->delete();

        return $this->success(null, 'Menu deleted successfully.');
    }

    /** Active top-level menus with active children, for the sorting screen. */
    public function tree(): JsonResponse
    {
        $menus = MenuItem::where('active', 1)
            ->where(fn ($q) => $q->where('parent_id', 0)->orWhereNull('parent_id'))
            ->with('children')
            ->orderBy('order_index')
            ->get()
            ->map(fn (MenuItem $m) => $this->present($m) + [
                'children' => $m->children->map(fn (MenuItem $c) => $this->present($c))->values()->all(),
            ]);

        return $this->success(['items' => $menus]);
    }

    /**
     * Body: { menus: [{ id }] } in the new order. order_index is globally
     * unique, so it is renumbered 1..n via temporary values (as the Blade panel does).
     */
    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'menus'      => ['required', 'array'],
            'menus.*.id' => ['required', 'integer', 'exists:menu_items,id'],
        ]);

        DB::transaction(function () use ($data) {
            foreach ($data['menus'] as $m) {
                MenuItem::where('id', $m['id'])->update(['order_index' => 100000 + $m['id']]);
            }
            foreach (array_values($data['menus']) as $i => $m) {
                MenuItem::where('id', $m['id'])->update(['order_index' => $i + 1]);
            }
        });

        return $this->success(null, 'Menu order updated successfully.');
    }

    private function save(Request $request, ?MenuItem $menu): JsonResponse
    {
        $data = $request->validate([
            'title'     => ['required', 'regex:/^[A-Za-z\s]+$/'],
            'url'       => ['required', 'string', 'max:255'],
            'parent'    => ['nullable', 'integer', 'exists:menu_items,id'],
            'target'    => ['required', Rule::in(array_keys(targettype()))],
            'page_type' => ['required', Rule::in(array_keys(pagetype()))],
            'menu_type' => ['required', Rule::in(array_keys(MenuItem::menuTypeOptions()))],
            'ordering'  => ['required', 'integer', Rule::unique('menu_items', 'order_index')->ignore($menu?->id)],
            'status'    => ['required', Rule::in(array_keys(statusoptions()))],
        ], [
            'title.regex'     => 'Title can contain letters and spaces only.',
            'ordering.unique' => 'This order position is already used by another menu.',
        ]);

        abort_if($menu && (int) ($data['parent'] ?? 0) === $menu->id, 422, 'A menu cannot be its own parent.');

        $type = (int) $data['menu_type'];
        $values = [
            'title'       => $data['title'],
            'url'         => $data['url'],
            'target'      => $data['target'],
            'parent_id'   => $data['parent'] ?: null,
            'type'        => $data['page_type'],
            'order_index' => $data['ordering'],
            'active'      => (bool) $data['status'],
            'is_main'     => in_array($type, [1, 3], true),
            'is_footer'   => in_array($type, [2, 3], true),
        ];

        if ($menu) {
            $menu->update($values);
            return $this->success(['id' => $menu->id], 'Menu Item updated successfully!');
        }

        $menu = MenuItem::create($values + ['created_by' => Auth::id()]);

        return $this->success(['id' => $menu->id], 'Menu Item created successfully!', 201);
    }

    private function present(MenuItem $m): array
    {
        return [
            'id'              => $m->id,
            'title'           => $m->title,
            'url'             => $m->url,
            'target'          => $m->target,
            'parent_id'       => $m->parent_id,
            'parent_title'    => $m->parent?->title,
            'page_type'       => (int) $m->type,
            'page_type_label' => $m->page_type_label,
            'menu_type_label' => $m->menu_type_label,
            'order_index'     => (int) $m->order_index,
            'status'          => (int) $m->active,
            'children_count'  => (int) ($m->children_count ?? 0),
            'created_by'      => $m->user?->full_name,
        ];
    }
}
