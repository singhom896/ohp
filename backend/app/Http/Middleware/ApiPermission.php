<?php

namespace App\Http\Middleware;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Models\Module;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

/**
 * Module permission check for routes/api.php.
 *
 * The web middleware derives the module from the URL; API URLs differ from the
 * page URLs, so the module's `page_url` is passed explicitly:
 *
 *   ->middleware('api.permission:/art-forms,view')
 *   ->middleware('api.permission:/content,create|edit')
 *
 * Must run after `jwt` so the user is resolved through the api guard.
 * Same rules as the web panel: modules + permissions tables, `has-permission`
 * gate, and Super Admin always passes on /permissions (`manage-permissions`).
 */
class ApiPermission
{
    use ApiResponse;

    public function handle(Request $request, Closure $next, string $modulePath, string $action = 'view'): Response
    {
        $modulePath = '/' . ltrim($modulePath, '/');

        if ($modulePath === '/permissions' && Gate::allows('manage-permissions')) {
            return $next($request);
        }

        $module = Module::where('page_url', $modulePath)->where('active', 1)->first();
        if (!$module) {
            return self::errorResponse("Module '{$modulePath}' is not available.", 404, 'module_not_found');
        }

        foreach (array_filter(array_map('trim', explode('|', $action))) as $permission) {
            if (Gate::allows('has-permission', [$module->module_id, $permission])) {
                return $next($request);
            }
        }

        return self::errorResponse(
            "You do not have permission to {$action} {$module->module_name}.",
            403,
            'forbidden'
        );
    }
}
