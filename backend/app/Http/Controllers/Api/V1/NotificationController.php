<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The signed-in user's own in-app notifications (module /notifications).
 *
 *   GET   /notifications?unread=1&page=      list + unread count
 *   GET   /notifications/count               unread count (sidebar / topbar badge)
 *   PATCH /notifications/{id}/read
 *   POST  /notifications/read-all
 */
class NotificationController extends Controller
{
    use ApiResponse;

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $page = DB::table('user_notifications')->where('user_id', $user->id)
            ->when($request->boolean('unread'), fn ($q) => $q->whereNull('read_at'))
            ->orderByDesc('id')->paginate(20, ['id', 'title', 'body', 'url', 'read_at', 'created_at'], 'page', max(1, $request->integer('page', 1)));

        return $this->success([
            'items' => collect($page->items())->map(fn ($n) => [
                'id' => $n->id, 'title' => $n->title, 'body' => $n->body, 'url' => $n->url,
                'read' => $n->read_at !== null, 'created_at' => $n->created_at,
            ])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'from' => $page->firstItem(), 'to' => $page->lastItem()],
            'unread' => $this->unread($user->id),
        ]);
    }

    public function count(Request $request): JsonResponse
    {
        return $this->success(['unread' => $this->unread($request->user()->id)]);
    }

    public function read(Request $request, int $id): JsonResponse
    {
        DB::table('user_notifications')->where('user_id', $request->user()->id)->where('id', $id)->whereNull('read_at')->update(['read_at' => now()]);

        return $this->success(['unread' => $this->unread($request->user()->id)]);
    }

    public function readAll(Request $request): JsonResponse
    {
        DB::table('user_notifications')->where('user_id', $request->user()->id)->whereNull('read_at')->update(['read_at' => now()]);

        return $this->success(['unread' => 0], 'All notifications marked as read.');
    }

    private function unread(int $userId): int
    {
        return DB::table('user_notifications')->where('user_id', $userId)->whereNull('read_at')->count();
    }
}
