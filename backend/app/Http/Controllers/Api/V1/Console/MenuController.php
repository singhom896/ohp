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

    /** menu => [flag column, order column]. Main Menu: order_index; Footer Menu: its own footer_order. */
    private const MENUS = ['main' => ['is_main', 'order_index'], 'footer' => ['is_footer', 'footer_order']];

    /**
     * GET /menus/tree?menu=main|footer
     * One menu as the public site builds it (top level + one level of children),
     * including inactive items (shown greyed out on the ordering screen).
     * Children whose parent is not in this menu never show on the site, so they
     * are left out here too (they are counted in `hidden`).
     */
    public function tree(Request $request): JsonResponse
    {
        $menu = $request->validate(['menu' => ['nullable', Rule::in(array_keys(self::MENUS))]])['menu'] ?? 'main';
        [$items, $hidden] = $this->menuItems($menu);

        $node = fn (MenuItem $m) => [
            'id' => $m->id, 'title' => $m->title, 'url' => $m->url, 'active' => (bool) $m->active,
            'page_type_label' => $m->page_type_label, 'menu_type_label' => $m->menu_type_label,
        ];
        $children = $items->filter(fn ($m) => ! $this->isTop($m))->groupBy('parent_id');

        return $this->success([
            'menu'   => $menu,
            'items'  => $items->filter(fn ($m) => $this->isTop($m))->values()->map(fn (MenuItem $m) => $node($m) + [
                'children' => ($children->get($m->id) ?? collect())->values()->map($node)->all(),
            ]),
            'hidden' => $hidden,
        ]);
    }

    /**
     * POST /menus/reorder
     * Body: { menu: "main"|"footer", items: [{ id, children: [id, ...] }, ...] }
     * in the new order. Items keep their parent (move a menu under another
     * parent from its Edit form). The whole menu must be sent, exactly as on
     * the server, so a stale screen cannot scramble the order.
     *   Main Menu   -> order_index 1..n (menus not in the Main Menu follow after,
     *                  so the "Order" values stay unique)
     *   Footer Menu -> footer_order 1..n
     */
    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'menu'               => ['required', Rule::in(array_keys(self::MENUS))],
            'items'              => ['required', 'array'],
            'items.*.id'         => ['required', 'integer'],
            'items.*.children'   => ['nullable', 'array'],
            'items.*.children.*' => ['integer'],
        ]);
        $menu = $data['menu'];
        [, $orderCol] = self::MENUS[$menu];

        DB::transaction(function () use ($data, $menu, $orderCol) {
            [$items] = $this->menuItems($menu, true);
            $byId = $items->keyBy('id');

            // Flatten: parent, then its children; check it matches the menu on the server.
            $flat = [];
            foreach ($data['items'] as $top) {
                $parent = $byId->get((int) $top['id']);
                abort_unless($parent && $this->isTop($parent), 409, 'The menu has changed. Please reload the page and try again.');
                $flat[] = $parent->id;
                foreach ($top['children'] ?? [] as $childId) {
                    $child = $byId->get((int) $childId);
                    abort_unless($child && (int) $child->parent_id === $parent->id, 409, 'The menu has changed. Please reload the page and try again.');
                    $flat[] = $child->id;
                }
            }
            abort_unless(count($flat) === count(array_unique($flat)) && count($flat) === $items->count(), 409,
                'The menu has changed. Please reload the page and try again.');

            foreach ($flat as $i => $id) {
                MenuItem::whereKey($id)->update([$orderCol => $i + 1]);
            }

            // Main Menu: menus that are not in it continue after it (unique "Order").
            if ($menu === 'main') {
                $n = count($flat);
                MenuItem::whereNotIn('id', $flat)->orderBy('order_index')->orderBy('id')->pluck('id')
                    ->each(function ($id) use (&$n) {
                        MenuItem::whereKey($id)->update(['order_index' => ++$n]);
                    });
            }
        });

        return $this->success(null, $menu === 'main' ? 'Main Menu order saved successfully.' : 'Footer Menu order saved successfully.');
    }

    /** [items of this menu in its order (top level + children whose parent is in it), number of hidden children]. */
    private function menuItems(string $menu, bool $lock = false): array
    {
        [$flag, $orderCol] = self::MENUS[$menu];
        $q = MenuItem::query()->where($flag, 1)
            ->orderByRaw("COALESCE({$orderCol}, 100000 + order_index)")->orderBy('id');
        $rows = ($lock ? $q->lockForUpdate() : $q)->get();
        $tops = $rows->filter(fn ($m) => $this->isTop($m))->pluck('id')->all();
        $kept = $rows->filter(fn ($m) => $this->isTop($m) || in_array((int) $m->parent_id, $tops, true))->values();

        return [$kept, $rows->count() - $kept->count()];
    }

    private function isTop(MenuItem $m): bool
    {
        return ! $m->parent_id; // null or 0
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

        // Newly in the Footer Menu: goes to the end of the footer order.
        if ($values['is_footer'] && (! $menu || ! $menu->is_footer || $menu->footer_order === null)) {
            $values['footer_order'] = (int) MenuItem::where('is_footer', 1)->max('footer_order') + 1;
        }

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
            'footer_order'    => $m->footer_order === null ? null : (int) $m->footer_order,
            'status'          => (int) $m->active,
            'children_count'  => (int) ($m->children_count ?? 0),
            'created_by'      => $m->user?->full_name,
        ];
    }
}
