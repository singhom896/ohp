<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\LoginHistory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Audit Trail -> Login History. Server-side paginated (the table grows fast). */
class LogController extends Controller
{
    use ApiResponse;

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));

        $page = LoginHistory::with('user.role')
            ->when($search !== '', function ($q) use ($search) {
                $like = '%' . $search . '%';
                $q->where(fn ($w) => $w->where('regno', 'like', $like)
                    ->orWhere('ip_address', 'like', $like)
                    ->orWhereHas('user', fn ($u) => $u->where('full_name', 'like', $like)->orWhere('email', 'like', $like)));
            })
            ->orderByDesc('created_at')
            ->paginate(min(100, max(10, $request->integer('per_page', 25))));

        return $this->success([
            'items' => collect($page->items())->map(fn (LoginHistory $h) => [
                'id'            => $h->id,
                'user'          => $h->user?->full_name,
                'email'         => $h->user?->email,
                'role'          => $h->user?->role?->name,
                'regno'         => $h->regno,
                'ip_address'    => $h->ip_address,
                'device'        => $h->device,
                'browser'       => $h->browser,
                'platform'      => $h->platform,
                'is_success'    => (bool) $h->is_success,
                'logged_in_at'  => optional($h->logged_in_at)->toIso8601String(),
                'logged_out_at' => optional($h->logged_out_at)->toIso8601String(),
            ]),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page'    => $page->lastPage(),
                'per_page'     => $page->perPage(),
                'total'        => $page->total(),
            ],
        ]);
    }
}
