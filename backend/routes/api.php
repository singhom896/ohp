<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\Console;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Opportunity Hub REST API  -  base URL: {APP_URL}/api/v1
|--------------------------------------------------------------------------
| Consumed by the Next.js frontend (frontend/). Every response uses the
| envelope in App\Http\Controllers\Api\Concerns\ApiResponse.
|
| Console (after-login) routes use the same access rules as the Blade panel
| under /cp: `jwt` authenticates, `api.permission:<module page_url>,<action>`
| checks the modules + permissions tables (App\Http\Middleware\ApiPermission).
|
| IDs are plain integers; access is enforced server-side on every call.
| File uploads: send multipart/form-data. PHP does not parse multipart PUT
| bodies, so every update also accepts POST /{id}.
*/

Route::prefix('v1')->group(function () {

    // Image + single-use key for the login / register forms.
    Route::get('captcha', [\App\Http\Controllers\Api\V1\CaptchaController::class, 'show'])->middleware('throttle:30,1');

    // Public website content (no login): CMS pages and footer links.
    Route::prefix('public')->middleware('throttle:240,1')->controller(\App\Http\Controllers\Api\V1\PublicContentController::class)->group(function () {
        Route::get('pages/{slug}', 'page')->where('slug', '[a-z0-9-]+');
        Route::get('footer-links', 'footerLinks');
        Route::get('main-menu', 'mainMenu');
        Route::get('gallery', 'gallery');
        Route::get('banners', 'banners');
    });

    // Public website pages linked from the header menu (no login).
    Route::prefix('public')->middleware('throttle:240,1')->controller(\App\Http\Controllers\Api\V1\PublicPagesController::class)->group(function () {
        Route::get('art-forms', 'artForms');
        Route::get('documents', 'documents');
        Route::get('media', 'media');
        Route::get('events', 'events');
        Route::get('events/{id}', 'event')->whereNumber('id');
        Route::get('artists', 'artists');
        Route::get('artists/{id}', 'artist')->whereNumber('id');
        Route::get('opportunities', 'opportunities');
        Route::get('opportunities/{id}', 'opportunity')->whereNumber('id');
    });

    // Newsletter (footer sign-up, confirmation and unsubscribe pages; no login).
    Route::prefix('public/newsletter')->controller(\App\Http\Controllers\Api\V1\NewsletterController::class)->group(function () {
        Route::post('subscribe', 'subscribe')->middleware('throttle:10,1');
        Route::post('verify', 'verify')->middleware('throttle:30,1');
        Route::get('unsubscribe', 'unsubscribeInfo')->middleware('throttle:30,1');
        Route::post('unsubscribe', 'unsubscribe')->middleware('throttle:30,1');
    });

    // Public registration helpers (form options, email OTP). Outside /auth so the
    // Next.js generic /api proxy can forward them.
    Route::prefix('registration')->controller(\App\Http\Controllers\Api\V1\RegistrationController::class)->group(function () {
        Route::get('options', 'options');
        Route::post('otp/{channel}/send', 'sendOtp')->whereIn('channel', ['email', 'mobile'])->middleware('throttle:6,1');
        Route::post('otp/{channel}/verify', 'verifyOtp')->whereIn('channel', ['email', 'mobile'])->middleware('throttle:20,1');
    });

    Route::prefix('auth')->group(function () {
        Route::middleware('throttle:10,1')->group(function () {
            Route::post('login', [AuthController::class, 'login']);
            Route::post('register', [AuthController::class, 'register']);
            // Forgot / reset password (Next.js /forgot-password, /reset-password)
            Route::post('forgot-password', [\App\Http\Controllers\Api\V1\PasswordResetController::class, 'forgot']);
            Route::post('reset-password', [\App\Http\Controllers\Api\V1\PasswordResetController::class, 'reset']);
        });
        Route::post('reset-password/check', [\App\Http\Controllers\Api\V1\PasswordResetController::class, 'check'])->middleware('throttle:30,1');

        // First password for admin-created / imported accounts (Next.js /set-password)
        Route::post('password-setup/check', [\App\Http\Controllers\Api\V1\PasswordSetupController::class, 'check'])->middleware('throttle:30,1');
        Route::post('password-setup', [\App\Http\Controllers\Api\V1\PasswordSetupController::class, 'store'])->middleware('throttle:10,1');

        // Accepts an expired token (inside the refresh window), so no `jwt` middleware.
        Route::post('refresh', [AuthController::class, 'refresh'])->middleware('throttle:30,1');

        Route::middleware('jwt')->group(function () {
            Route::get('me', [AuthController::class, 'me']);
            Route::post('logout', [AuthController::class, 'logout']);
        });
    });

    Route::middleware(['jwt', 'throttle:240,1'])->group(function () {

        // ---- Signed-in user's own console --------------------------------
        Route::prefix('console')->controller(Console\ConsoleController::class)->group(function () {
            Route::get('menu', 'menu');
            Route::get('dashboard', 'dashboard')->middleware('api.permission:/dashboard,view');
            Route::get('profile', 'profile');
            Route::put('profile', 'updateProfile');
            Route::put('password', 'updatePassword')->middleware('throttle:10,1');
        });

        // ---- Artist "My Profile" (roles 5, 6, 7; checked in the controller) ----
        Route::prefix('artist/profile')->controller(\App\Http\Controllers\Api\V1\Artist\ArtistProfileController::class)->group(function () {
            Route::get('/', 'show');
            Route::post('/', 'update')->middleware('throttle:30,1');
        });

        // ---- Artist "My Application": status, details, preview, history (roles 5, 6, 7) ----
        Route::prefix('artist/application')->controller(\App\Http\Controllers\Api\V1\Artist\ArtistApplicationController::class)->group(function () {
            Route::get('/', 'index');
            Route::get('details', 'details');
            Route::get('preview', 'preview');
            Route::get('history', 'history');
        });

        // ---- Artist Management -> Update Requests (ZCC Nodal Officers, Admins) ----
        Route::prefix('profile-updates')->controller(Console\ProfileUpdateController::class)->group(function () {
            Route::get('/', 'index')->middleware('api.permission:/profile-updates,view');
            Route::get('report', 'report')->middleware('api.permission:/profile-updates,view');
            Route::get('{id}', 'show')->whereNumber('id')->middleware('api.permission:/profile-updates,view');
            Route::post('{id}/decision', 'decide')->whereNumber('id')->middleware(['api.permission:/profile-updates,edit', 'throttle:30,1']);
        });

        // ---- Own in-app notifications (every signed-in user) ----
        Route::prefix('notifications')->controller(\App\Http\Controllers\Api\V1\NotificationController::class)->group(function () {
            Route::get('/', 'index');
            Route::get('count', 'count');
            Route::patch('{id}/read', 'read')->whereNumber('id');
            Route::post('read-all', 'readAll');
        });

        // ---- Engagement Partner console (role 11; checked in the controllers) ----
        Route::prefix('partner')->group(function () {
            Route::get('dashboard', [\App\Http\Controllers\Api\V1\Partner\EngagementController::class, 'dashboard'])->middleware('api.permission:/dashboard,view');

            Route::controller(\App\Http\Controllers\Api\V1\Partner\ProfileController::class)->prefix('profile')->group(function () {
                Route::get('/', 'show')->middleware('api.permission:/partner-profile,view');
                Route::post('/', 'update')->middleware(['api.permission:/partner-profile,edit', 'throttle:30,1']);
            });

            // Opportunities: post, manage, engagement requests, bookings, feedback, event media.
            Route::controller(\App\Http\Controllers\Api\V1\Partner\RequirementController::class)->prefix('requirements')->group(function () {
                Route::get('/', 'index')->middleware('api.permission:/requirements,view');
                Route::get('options', 'options')->middleware('api.permission:/requirements,view');
                Route::get('match-count', 'matchCount')->middleware(['api.permission:/requirements,view', 'throttle:60,1']);
                Route::get('{id}', 'show')->whereNumber('id')->middleware('api.permission:/requirements,view');
                Route::post('/', 'store')->middleware(['api.permission:/requirements,create', 'throttle:20,1']);
                Route::put('{id}', 'update')->whereNumber('id')->middleware(['api.permission:/requirements,edit', 'throttle:30,1']);
                Route::post('{id}/status', 'status')->whereNumber('id')->middleware('api.permission:/requirements,edit');
                Route::delete('{id}', 'destroy')->whereNumber('id')->middleware('api.permission:/requirements,delete');
                Route::post('{id}/invite', 'invite')->whereNumber('id')->middleware(['api.permission:/requirements,edit', 'throttle:30,1']);
                Route::post('{id}/matches/{matchId}/booking', 'book')->whereNumber(['id', 'matchId'])->middleware(['api.permission:/requirements,edit', 'throttle:30,1']);
                Route::patch('{id}/matches/{matchId}/booking', 'updateBooking')->whereNumber(['id', 'matchId'])->middleware(['api.permission:/requirements,edit', 'throttle:30,1']);
                Route::post('{id}/matches/{matchId}/feedback', 'feedback')->whereNumber(['id', 'matchId'])->middleware(['api.permission:/requirements,edit', 'throttle:30,1']);
                Route::post('{id}/media', 'uploadMedia')->whereNumber('id')->middleware(['api.permission:/requirements,edit', 'throttle:60,1']);
                Route::delete('{id}/media/{mediaId}', 'deleteMedia')->whereNumber(['id', 'mediaId'])->middleware('api.permission:/requirements,edit');
            });

            Route::controller(\App\Http\Controllers\Api\V1\Partner\ArtistSearchController::class)->group(function () {
                Route::get('artists', 'index')->middleware('api.permission:/find-artists,view');
                Route::get('artists/{id}', 'show')->whereNumber('id')->middleware('api.permission:/find-artists,view');
                Route::get('shortlist', 'shortlist')->middleware('api.permission:/shortlist,view');
                Route::post('shortlist', 'addToShortlist')->middleware(['api.permission:/find-artists,edit', 'throttle:60,1']);
                Route::delete('shortlist/{artistId}', 'removeFromShortlist')->whereNumber('artistId')->middleware('api.permission:/find-artists,edit');
            });

            Route::controller(\App\Http\Controllers\Api\V1\Partner\EngagementController::class)->group(function () {
                Route::get('engagements', 'engagements')->middleware('api.permission:/engagements,view');
                Route::get('bookings', 'bookings')->middleware('api.permission:/partner-bookings,view');
                Route::get('reports', 'reports')->middleware('api.permission:/partner-reports,view');
            });
        });

        // ---- Artist / Group accounts (roles 5, 6, 7; checked in the controllers) ----
        // Opportunities, booking requests, confirmed performances, saved, history.
        Route::prefix('artist/opportunities')->controller(\App\Http\Controllers\Api\V1\Artist\OpportunityController::class)->group(function () {
            Route::get('/', 'index')->middleware('api.permission:/opportunities,view');
            Route::get('{id}', 'show')->whereNumber('id')->middleware('api.permission:/opportunities,view');
            Route::post('{id}/interest', 'interest')->whereNumber('id')->middleware(['api.permission:/opportunities,edit', 'throttle:30,1']);
            Route::post('{id}/save', 'save')->whereNumber('id')->middleware(['api.permission:/opportunities,edit', 'throttle:60,1']);
        });
        Route::get('artist/registration-card', [\App\Http\Controllers\Api\V1\Artist\RegistrationCardController::class, 'show'])->middleware('api.permission:/registration-card,view');
        Route::prefix('artist/group-members')->controller(\App\Http\Controllers\Api\V1\Artist\GroupMemberController::class)->group(function () {
            Route::get('/', 'index')->middleware('api.permission:/group-members,view');
            Route::get('lookup', 'lookup')->middleware(['api.permission:/group-members,create', 'throttle:30,1']);
            Route::post('/', 'store')->middleware(['api.permission:/group-members,create', 'throttle:30,1']);
            Route::delete('{artistId}', 'destroy')->whereNumber('artistId')->middleware('api.permission:/group-members,delete');
        });

        // ---- Administration: Engagement Partners, Reports & MIS ----
        Route::prefix('engagement-partners')->controller(Console\EngagementPartnerController::class)->group(function () {
            Route::get('/', 'index')->middleware('api.permission:/engagement-partners,view');
            Route::get('{id}', 'show')->whereNumber('id')->middleware('api.permission:/engagement-partners,view');
            Route::patch('{id}/status', 'status')->whereNumber('id')->middleware('api.permission:/engagement-partners,edit');
            Route::patch('{id}/verify', 'verify')->whereNumber('id')->middleware('api.permission:/engagement-partners,edit');
        });
        Route::get('reports/overview', [Console\ReportController::class, 'overview'])->middleware('api.permission:/reports,view');
        // Admins (full) and ZCC Nodal Officers (view): everything.
        Route::prefix('bookings')->controller(Console\BookingController::class)->group(function () {
            Route::get('/', 'index')->middleware('api.permission:/bookings,view');
            Route::get('confirmed', 'confirmed')->middleware('api.permission:/bookings,view');
            Route::get('{id}', 'show')->whereNumber('id')->middleware('api.permission:/bookings,view');
            Route::post('{id}/status', 'status')->whereNumber('id')->middleware('api.permission:/bookings,edit');
        });

        // ---- CMS Management -> Newsletter ----
        Route::prefix('newsletter')->controller(Console\NewsletterController::class)->group(function () {
            Route::get('/', 'index')->middleware('api.permission:/newsletter,view');
            Route::get('export', 'export')->middleware('api.permission:/newsletter,view');
            Route::patch('{id}/status', 'status')->whereNumber('id')->middleware('api.permission:/newsletter,edit');
            Route::delete('{id}', 'destroy')->whereNumber('id')->middleware('api.permission:/newsletter,delete');
            Route::get('events', 'events')->middleware('api.permission:/newsletter,view');
            Route::get('events/{id}/history', 'eventHistory')->whereNumber('id')->middleware('api.permission:/newsletter,view');
            Route::post('events/{id}/send', 'sendEvent')->whereNumber('id')->middleware(['api.permission:/newsletter,edit', 'throttle:20,1']);
        });

        // ---- Dropdown data ------------------------------------------------
        Route::prefix('lookups')->controller(Console\LookupController::class)->group(function () {
            Route::get('options', 'options');
            Route::get('countries', 'countries');
            Route::get('countries/{country}/regions', 'regions')->whereNumber('country');
            Route::get('countries/{country}/art-form-parents', 'artFormParents')->whereNumber('country');
        });

        // ---- Data Management: country-scoped masters ----------------------
        foreach (array_keys(Console\MasterDataController::RESOURCES) as $resource) {
            $perm = fn (string $action) => "api.permission:/{$resource},{$action}";

            Route::prefix("masters/{$resource}")
                ->controller(Console\MasterDataController::class)
                ->group(function () use ($perm, $resource) {
                    Route::get('/', 'index')->middleware($perm('view'))->defaults('resource', $resource);
                    Route::post('/', 'store')->middleware($perm('create'))->defaults('resource', $resource);
                    Route::get('{id}', 'show')->whereNumber('id')->middleware($perm('view'))->defaults('resource', $resource);
                    Route::match(['put', 'post'], '{id}', 'update')->whereNumber('id')->middleware($perm('edit'))->defaults('resource', $resource);
                    Route::patch('{id}/status', 'status')->whereNumber('id')->middleware($perm('edit'))->defaults('resource', $resource);
                });
        }

        Route::prefix('countries')->controller(Console\CountryController::class)->group(function () {
            Route::get('/', 'index')->middleware('api.permission:/countries,view');
            Route::patch('{id}/status', 'status')->whereNumber('id')->middleware('api.permission:/countries,edit');
        });

        // ---- CMS, Events, Administration: standard CRUD resources ---------
        // [url prefix, controller, module page_url, has delete]
        $resources = [
            ['banners',      Console\BannerController::class,      '/banners',     true],
            ['ministers',    Console\MinisterController::class,    '/ministers',   true],
            ['content',      Console\ContentController::class,     '/content',     false],
            ['documents',    Console\DocumentController::class,    '/documents',   true],
            ['gallery',      Console\GalleryController::class,     '/gallery',     true],
            ['videos',       Console\VideoController::class,       '/video',       true],
            ['testimonials', Console\TestimonialController::class, '/testimonial', true],
            ['events',       Console\EventController::class,       '/event',       true],
            ['users',        Console\UserController::class,        '/users',       false],
            ['roles',        Console\RoleController::class,        '/role',        false],
            ['modules',      Console\ModuleController::class,      '/modules',     true],
            ['menus',        Console\MenuController::class,        '/menus',       true],
        ];

        // Extra read endpoints some forms need (must be registered before {id}).
        Route::get('content/menus', [Console\ContentController::class, 'menus'])->middleware('api.permission:/content,create|edit');
        Route::get('documents/options', [Console\DocumentController::class, 'options'])->middleware('api.permission:/documents,create|edit');
        Route::get('users/options', [Console\UserController::class, 'options'])->middleware('api.permission:/users,create|edit');
        Route::get('modules/options', [Console\ModuleController::class, 'options'])->middleware('api.permission:/modules,create|edit');
        Route::get('modules/tree', [Console\ModuleController::class, 'tree'])->middleware('api.permission:/modules,edit');
        Route::post('modules/reorder', [Console\ModuleController::class, 'reorder'])->middleware('api.permission:/modules,edit');
        Route::get('menus/options', [Console\MenuController::class, 'options'])->middleware('api.permission:/menus,create|edit');
        Route::get('menus/tree', [Console\MenuController::class, 'tree'])->middleware('api.permission:/menus,edit');
        Route::post('menus/reorder', [Console\MenuController::class, 'reorder'])->middleware('api.permission:/menus,edit');

        foreach ($resources as [$prefix, $controller, $module, $hasDelete]) {
            Route::prefix($prefix)->controller($controller)->group(function () use ($module, $hasDelete) {
                Route::get('/', 'index')->middleware("api.permission:{$module},view");
                Route::post('/', 'store')->middleware("api.permission:{$module},create");
                Route::get('{id}', 'show')->whereNumber('id')->middleware("api.permission:{$module},view");
                Route::match(['put', 'post'], '{id}', 'update')->whereNumber('id')->middleware("api.permission:{$module},edit");
                Route::patch('{id}/status', 'status')->whereNumber('id')->middleware("api.permission:{$module},edit");
                if ($hasDelete) {
                    Route::delete('{id}', 'destroy')->whereNumber('id')->middleware("api.permission:{$module},delete");
                }
            });
        }

        // Event media (photos / MP4 / YouTube)
        Route::prefix('events')->controller(Console\EventController::class)->group(function () {
            Route::post('{id}/media', 'uploadMedia')->whereNumber('id')->middleware('api.permission:/event,edit');
            Route::patch('media/{mediaId}/status', 'mediaStatus')->whereNumber('mediaId')->middleware('api.permission:/event,edit');
            Route::delete('media/{mediaId}', 'deleteMedia')->whereNumber('mediaId')->middleware('api.permission:/event,delete');
        });

        // Role permission matrix
        Route::get('permissions', [Console\PermissionController::class, 'index'])->middleware('api.permission:/permissions,view');
        Route::patch('permissions', [Console\PermissionController::class, 'update'])->middleware('api.permission:/permissions,edit');

        // Audit trail
        Route::get('logs', [Console\LogController::class, 'index'])->middleware('api.permission:/logs,view');

        // ---- Artist Management --------------------------------------------
        Route::prefix('artists')->group(function () {
            Route::controller(Console\ArtistImportController::class)->prefix('import')->group(function () {
                Route::get('meta', 'meta')->middleware('api.permission:/artist,create');
                Route::get('template/{format}', 'template')->middleware('api.permission:/artist,create');
                Route::post('/', 'upload')->middleware(['api.permission:/artist,create', 'throttle:20,1']);
                Route::get('{token}', 'showState')->whereUuid('token')->middleware('api.permission:/artist,create');
                Route::post('{token}/process', 'processBatch')->whereUuid('token')->middleware('api.permission:/artist,create');
                Route::get('{token}/report', 'report')->whereUuid('token')->middleware('api.permission:/artist,create');
            });

            Route::controller(Console\ArtistRegistrationController::class)->group(function () {
                Route::get('/', 'index')->middleware('api.permission:/artist,view');
                Route::get('form-options', 'formOptions')->middleware('api.permission:/artist,create|edit');
                Route::post('/', 'store')->middleware('api.permission:/artist,create');
                Route::get('{id}', 'show')->whereNumber('id')->middleware('api.permission:/artist,view');
                Route::post('{id}', 'update')->whereNumber('id')->middleware('api.permission:/artist,edit');
                Route::patch('{id}/status', 'status')->whereNumber('id')->middleware('api.permission:/artist,edit');
            });
        });
    });
});
