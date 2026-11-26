<?php

namespace App\Http\Controllers\Api\Concerns;

use Illuminate\Http\JsonResponse;

/**
 * Single JSON envelope for every API response:
 *
 *   success: { "success": true,  "message": "...", "data": {...} }
 *   error:   { "success": false, "message": "...", "code": "token_expired", "errors": {...} }
 *
 * `code` is a stable machine-readable string the frontend can branch on.
 */
trait ApiResponse
{
    protected function success(mixed $data = null, string $message = 'OK', int $status = 200): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data'    => $data,
        ], $status);
    }

    protected function error(string $message, int $status = 400, ?string $code = null, mixed $errors = null): JsonResponse
    {
        return self::errorResponse($message, $status, $code, $errors);
    }

    /** Static form so middleware and the exception handler can share it. */
    public static function errorResponse(string $message, int $status = 400, ?string $code = null, mixed $errors = null): JsonResponse
    {
        $body = [
            'success' => false,
            'message' => $message,
            'code'    => $code,
        ];

        if ($errors !== null) {
            $body['errors'] = $errors;
        }

        return response()->json($body, $status);
    }
}
