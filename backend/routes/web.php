<?php

use App\Http\Controllers\MaintenanceController;
use Illuminate\Support\Facades\Route;

/*
 * This Laravel app is API only (routes/api.php, /api/v1/*). The website and
 * the Admin / Artist / Engagement Partner consoles are the Next.js app in
 * /frontend. The only web route left is the cache-clear helper.
 */
Route::get('/clearit', [MaintenanceController::class, 'clearit'])->name('clearit');
