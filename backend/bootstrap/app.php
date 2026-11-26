<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Support\Facades\Route;
use Illuminate\Console\Scheduling\Schedule;


use App\Http\Middleware\JwtAuthenticate;
use App\Http\Middleware\ApiPermission;
use App\Http\Controllers\Api\Concerns\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withSchedule(function (Schedule $schedule) {
        // $schedule->command('fetch:proposal')->everyMinute();
    })
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            // Stateless JWT auth for the REST API (routes/api.php).
            'jwt' => JwtAuthenticate::class,
            // Module permission check for API routes (after `jwt`).
            'api.permission' => ApiPermission::class,
        ]);

        // The Next.js server calls this API for every visitor and sends the
        // visitor's IP in X-Forwarded-For. Trust that header ONLY from the
        // Next.js server's own address(es), so $request->ip() and the per-IP
        // rate limits (captcha, login, register, forgot password) are per visitor.
        // .env TRUSTED_PROXIES: comma-separated IPs / CIDRs of the Next.js server.
        // NOTE: with `artisan config:cache` .env is not read, so this falls back to
        // the default below; set it as a real environment variable if it differs.
        $trusted = array_values(array_filter(array_map('trim', explode(',', (string) env('TRUSTED_PROXIES', '127.0.0.1,::1')))));
        $middleware->trustProxies(
            at: $trusted,
            headers: Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PROTO,
        );
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // API routes always answer in the ApiResponse JSON envelope.
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());

        $exceptions->render(function (ValidationException $e, Request $request) {
            if ($request->is('api/*')) {
                return ApiResponse::errorResponse($e->getMessage(), 422, 'validation_error', $e->errors());
            }
        });

        $exceptions->render(function (ThrottleRequestsException $e, Request $request) {
            if ($request->is('api/*')) {
                return ApiResponse::errorResponse('Too many attempts. Please try again in a minute.', 429, 'too_many_requests');
            }
        });

        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            if ($request->is('api/*')) {
                $status = $e->getStatusCode();
                $message = $e->getMessage() ?: (\Symfony\Component\HttpFoundation\Response::$statusTexts[$status] ?? 'Error');
                return ApiResponse::errorResponse($message, $status, 'http_' . $status);
            }
        });
    })
    ->create();
    