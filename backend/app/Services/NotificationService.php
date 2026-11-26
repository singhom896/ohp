<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * In-app notifications (user_notifications), shown on the Notifications page
 * of the artist and partner consoles. Emails are sent separately; a failure
 * here never stops the action that triggered it.
 *
 * $url is a console path relative to the user's own console, e.g.
 * "/opportunities/view?id=5" (the frontend prefixes /artist or /partner).
 */
class NotificationService
{
    public function notify(int|array $userIds, string $title, ?string $body = null, ?string $url = null): void
    {
        $now = now();
        $rows = collect((array) $userIds)->filter()->unique()->map(fn ($id) => [
            'user_id' => (int) $id, 'title' => Str::limit($title, 197), 'body' => $body ? Str::limit($body, 997) : null,
            'url' => $url, 'created_at' => $now, 'updated_at' => $now,
        ])->values()->all();
        if (! $rows) {
            return;
        }
        try {
            foreach (array_chunk($rows, 500) as $chunk) {
                DB::table('user_notifications')->insert($chunk);
            }
        } catch (\Throwable $e) {
            Log::warning('In-app notification failed: '.$e->getMessage());
        }
    }

    public function unreadCount(int $userId): int
    {
        return DB::table('user_notifications')->where('user_id', $userId)->whereNull('read_at')->count();
    }
}
