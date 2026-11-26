<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Gate;
use App\Models\Permission;

class AppServiceProvider extends ServiceProvider
{

    public function register(): void {}

    public function boot(): void
    {
        Gate::define('has-permission', function ($user, $module_id, $action) {
            $permission = Permission::where(['role_id' => $user->role->id, 'module_id' => $module_id])->first(); //echo "<pre>"; print_r($permission); die;
            if (!$permission) {
                return false;
            }
            return match ($action) {
                'view' => $permission->can_view,
                'create' => $permission->can_create,
                'edit' => $permission->can_edit,
                'delete' => $permission->can_delete,
                default => false,
            };
        });

        Gate::define('manage-permissions', function ($user) {
            return $user->role->id === 1;
        });

        // Newsletter: email active subscribers when an event is published (created
        // active, or switched from inactive to active). See EventNewsletterObserver.
        \App\Models\Event::observe(\App\Observers\EventNewsletterObserver::class);

        // Persistent DB connections (DB_PERSISTENT=true, see config/database.php):
        // a request that died mid-transaction leaves it open on the reused
        // connection, so roll it back before this request uses it.
        if (config('database.connections.pgsql.options.' . \PDO::ATTR_PERSISTENT)) {
            \Illuminate\Support\Facades\Event::listen(\Illuminate\Database\Events\ConnectionEstablished::class, function ($event) {
                $pdo = $event->connection->getPdo();
                if ($pdo instanceof \PDO && $pdo->inTransaction()) {
                    $pdo->rollBack();
                }
            });
        }
    }
}
