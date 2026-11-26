<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Content;
use App\Models\MenuItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

/**
 * CMS page content. Same rules as Backend\ContentController: one content per
 * "Content" type menu item (menu_items.type = 2).
 */
class ContentController extends Controller
{
    use ApiResponse;

    public function index(): JsonResponse
    {
        $items = Content::with('menu')->orderByDesc('id')->get()->map(fn (Content $c) => [
            'id'         => $c->id,
            'title'      => $c->title,
            'slug'       => $c->slug,
            'menu_id'    => $c->menu_id,
            'menu_title' => $c->menu?->title,
            'status'     => (int) $c->is_active,
            'updated_at' => optional($c->updated_at)->toIso8601String(),
        ]);

        return $this->success(['items' => $items]);
    }

    public function show(int $id): JsonResponse
    {
        $c = Content::findOrFail($id);

        return $this->success(['item' => [
            'id' => $c->id, 'title' => $c->title, 'menu' => $c->menu_id,
            'cktext' => $c->content, 'status' => (int) $c->is_active,
        ]]);
    }

    /** Content-type menus that do not have content yet (plus the current one when editing). */
    public function menus(Request $request): JsonResponse
    {
        $current = $request->integer('content_id') ?: null;
        $currentMenu = $current ? Content::whereKey($current)->value('menu_id') : null;

        $menus = MenuItem::with('parent')
            ->where('active', 1)->where('type', 2)
            ->where(function ($q) use ($currentMenu) {
                $q->whereNotExists(fn ($s) => $s->selectRaw('1')->from('contents')->whereColumn('contents.menu_id', 'menu_items.id'));
                if ($currentMenu) {
                    $q->orWhere('menu_items.id', $currentMenu);
                }
            })
            ->orderBy('title')
            ->get()
            ->map(fn (MenuItem $m) => [
                'id'    => $m->id,
                'title' => $m->parent ? "{$m->parent->title} → {$m->title}" : $m->title,
            ]);

        return $this->success(['menus' => $menus]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, null);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->save($request, Content::findOrFail($id));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'boolean']]);
        $content = Content::findOrFail($id);
        $content->is_active = (int) $data['status'];
        $content->save();

        return $this->success(['status' => (int) $content->is_active],
            $content->is_active ? 'Content activated successfully.' : 'Content deactivated successfully.');
    }

    private function save(Request $request, ?Content $content): JsonResponse
    {
        $menuIds = MenuItem::where('active', 1)->where('type', 2)->pluck('id')->all();

        $data = $request->validate([
            'title'  => ['required', 'string', 'max:255'],
            'menu'   => ['required', 'integer', Rule::in($menuIds),
                Rule::unique('contents', 'menu_id')->ignore($content?->id)],
            'cktext' => ['required', 'string'],
            'status' => ['required', 'in:0,1'],
        ], [
            'title.required'  => 'Please enter Title.',
            'title.max'       => 'Title may not be greater than 255 characters.',
            'menu.required'   => 'Please select Menu.',
            'menu.in'         => 'Invalid Menu selected.',
            'menu.unique'     => 'Content already exists for this Menu.',
            'cktext.required' => 'Please enter Content.',
            'status.required' => 'Please select Status.',
        ]);

        $menu = MenuItem::findOrFail($data['menu']);
        $values = [
            'menu_id'   => $menu->id,
            'slug'      => $menu->url ? basename(trim($menu->url, '/')) : null,
            'title'     => trim($data['title']),
            'content'   => $data['cktext'],
            'is_active' => (int) $data['status'],
        ];

        if ($content) {
            $content->update($values);
            return $this->success(['id' => $content->id], 'Content updated successfully!');
        }

        $content = Content::create($values + ['created_by' => Auth::id()]);

        return $this->success(['id' => $content->id], 'Content created successfully!', 201);
    }
}
