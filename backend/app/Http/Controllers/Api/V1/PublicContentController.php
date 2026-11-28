<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\Banner;
use App\Models\Content;
use App\Models\Gallery;
use App\Models\MenuItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public (no login) CMS content for the Next.js website.
 *
 *   GET /public/pages/{slug}    one active content page (Privacy Policy, Terms, ...)
 *   GET /public/footer-links    active footer menu items, in order
 *
 * The HTML is returned as stored; the Next.js page sanitises it before rendering.
 */
class PublicContentController extends Controller
{
    use ApiResponse, ConsoleScope; // ConsoleScope only for fileUrl()

    public function page(string $slug): JsonResponse
    {
        $page = Content::query()
            ->where('slug', $slug)
            ->where('is_active', 1)
            ->first();

        abort_unless($page, 404, 'Page not found.');

        return $this->success([
            'slug'       => $page->slug,
            'title'      => $page->title,
            'content'    => (string) $page->content,
            'updated_at' => optional($page->updated_at)->toIso8601String(),
        ]);
    }

    /**
     * Website header menu (Administration -> Menus, "Main Menu"): active items
     * in "Order", one level of children (e.g. Media -> Photos & Videos).
     */
    public function mainMenu(): JsonResponse
    {
        return $this->success(['items' => $this->menuTree('is_main')]);
    }

    /**
     * Website footer (Administration -> Menus, "Footer Menu"). A footer menu
     * with child menus is a column (title = heading); the others are the
     * "Company" links. `links` = every footer link, flat (used for CMS pages).
     */
    public function footerLinks(): JsonResponse
    {
        $items = $this->menuTree('is_footer');
        $links = $items->flatMap(fn (array $m) => $m['children'] ?: [$m])
            ->map(fn (array $m) => ['title' => $m['title'], 'url' => $m['url'], 'target' => $m['target']])
            ->values();

        // "Last updated" in the website footer: the latest change to public content.
        $lastUpdated = collect(['contents', 'menu_items', 'banners', 'galleries'])
            ->map(fn (string $table) => \DB::table($table)->max('updated_at'))
            ->filter()
            ->max();

        return $this->success([
            'items'        => $items,
            'links'        => $links,
            'last_updated' => $lastUpdated ? \Illuminate\Support\Carbon::parse($lastUpdated)->toDateString() : null,
        ]);
    }

    /**
     * Active menu items flagged $flag (is_main / is_footer), in "Order", with one
     * level of children. A "Content" type menu shows only while its page is active.
     */
    private function menuTree(string $flag): \Illuminate\Support\Collection
    {
        $rows = MenuItem::query()
            ->where('active', 1)
            ->where($flag, 1)
            ->where(fn ($q) => $q->where('type', '!=', 2)->orWhereExists(fn ($s) => $s->selectRaw('1')
                ->from('contents')
                ->whereColumn('contents.menu_id', 'menu_items.id')
                ->where('contents.is_active', 1)))
            // Footer Menu has its own order (footer_order); the Main Menu uses order_index.
            ->when($flag === 'is_footer', fn ($q) => $q->orderByRaw('COALESCE(footer_order, 100000 + order_index)'), fn ($q) => $q->orderBy('order_index'))
            ->orderBy('id')
            ->get(['id', 'title', 'url', 'target', 'parent_id']);

        $item = fn (MenuItem $m) => [
            'title'  => $m->title,
            'url'    => (string) $m->url,
            'target' => $m->target === '_blank' ? '_blank' : '_self',
        ];
        $children = $rows->whereNotNull('parent_id')->groupBy('parent_id');

        return $rows->whereNull('parent_id')->values()->map(fn (MenuItem $m) => $item($m) + [
            'children' => ($children->get($m->id) ?? collect())->values()->map($item)->all(),
        ]);
    }
    /** Active home page banners (CMS Management -> Banners), by priority ordering. */
    public function banners(): JsonResponse
    {
        $items = Banner::with('asset')
            ->where('active', 1)
            ->whereNotNull('assets_id')
            ->orderBy('priority_ordering')
            ->orderBy('id')
            ->get()
            ->filter(fn (Banner $b) => $b->asset?->url)
            ->map(fn (Banner $b) => [
                'id'    => $b->id,
                'title' => $b->title,
                'image' => $this->fileUrl($b->asset->url),
            ])
            ->values();

        return $this->success(['items' => $items]);
    }

    /** Active gallery photos (CMS Management -> Gallery), in the admin's sort order. */
    public function gallery(Request $request): JsonResponse
    {
        $limit = min(48, max(1, $request->integer('limit', 12)));

        $items = Gallery::with('asset')
            ->where('is_deleted', 0)
            ->where('active', 1)
            ->whereNotNull('assets_id')
            ->orderBy('sortorder')
            ->orderByDesc('id')
            ->limit($limit)
            ->get()
            ->filter(fn (Gallery $g) => $g->asset?->url)
            ->map(fn (Gallery $g) => [
                'id'        => $g->id,
                'title'     => $g->title,
                'location'  => $g->location,
                'video_url' => $g->video_url,
                'type'      => $g->type,
                'date'  => optional($g->date)->format('Y-m-d'),
                'image' => $this->fileUrl($g->asset->url),
            ])
            ->values();

        return $this->success(['items' => $items]);
    }
}
