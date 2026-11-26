<?php

namespace App\Http\Middleware;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Tymon\JWTAuth\Exceptions\JWTException;
use Tymon\JWTAuth\Exceptions\TokenBlacklistedException;
use Tymon\JWTAuth\Exceptions\TokenExpiredException;

/**
 * Verifies the Bearer JWT on API routes and returns JSON errors with a
 * stable `code` so the frontend knows whether to refresh or log out:
 *
 *   token_missing / token_invalid / token_revoked  -> log out
 *   token_expired                                  -> try /auth/refresh
 *   account_blocked (403)                          -> log out with message
 *
 * Registered as the `jwt` alias in bootstrap/app.php.
 */
class JwtAuthenticate
{
    public function handle(Request $request, Closure $next): Response
    {
        $guard = auth('api');

        if (!$request->bearerToken()) {
            return ApiResponse::errorResponse('Authentication token is missing.', 401, 'token_missing');
        }

        try {
            // Parses the Bearer token from the request and verifies signature,
            // expiry and blacklist; throws on failure.
            $guard->getPayload();
        } catch (TokenExpiredException) {
            return ApiResponse::errorResponse('Your session has expired.', 401, 'token_expired');
        } catch (TokenBlacklistedException) {
            return ApiResponse::errorResponse('Your session has been signed out.', 401, 'token_revoked');
        } catch (JWTException) {
            return ApiResponse::errorResponse('Invalid authentication token.', 401, 'token_invalid');
        }

        $user = $guard->user();
        if (!$user) {
            return ApiResponse::errorResponse('User no longer exists.', 401, 'token_invalid');
        }

        $user->loadMissing('role');
        if ($reason = $user->accountBlockReason()) {
            return ApiResponse::errorResponse($reason, 403, 'account_blocked');
        }

        // Make $request->user() / auth()->user() resolve through the JWT guard.
        auth()->shouldUse('api');

        return $next($request);
    }
}
