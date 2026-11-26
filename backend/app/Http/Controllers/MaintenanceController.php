<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;
use Illuminate\Support\Facades\Artisan;

/**
 * GET /clearit - clears the route, view and application caches, rebuilds the
 * config cache and makes sure the storage link exists (for servers without
 * shell access). The website itself is the Next.js app in /frontend.
 */
class MaintenanceController extends Controller
{
    public function clearit(): Response
    {
        Artisan::call('route:clear');
        Artisan::call('view:clear');
        Artisan::call('cache:clear');
        Artisan::call('config:cache');
        Artisan::call('storage:link');

        return response("All commands executed successfully. Cache cleared successfully.\n", 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }
}
