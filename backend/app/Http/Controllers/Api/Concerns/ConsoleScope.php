<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\Module;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;

/**
 * Helpers shared by the console (after-login) API controllers. Mirrors the
 * rules of the Blade panel: role 8 (Nodal Agency) is locked to its own
 * country, roles 4 and 8 have country-scoped artist access (hasCountryAccess()).
 */
trait ConsoleScope
{
    protected function roleId(): int
    {
        return (int) Auth::user()?->role_id;
    }

    protected function countryId(): ?int
    {
        $id = Auth::user()?->country_id;

        return $id ? (int) $id : null;
    }

    protected function isNodal(): bool
    {
        return $this->roleId() === 8;
    }

    /** Nodal users must be linked to a country; returns that country id. */
    protected function requireNodalCountry(): int
    {
        abort_if(!$this->countryId(), 403, 'Your account is not linked to a country.');

        return $this->countryId();
    }

    /** Can the current user perform $action on the module with this page_url? */
    protected function can(string $modulePath, string $action): bool
    {
        $module = Module::where('page_url', $modulePath)->where('active', 1)->first();

        return $module && Gate::allows('has-permission', [$module->module_id, $action]);
    }

    /**
     * Absolute URL for a file under backend/public, so the Next.js app (another
     * origin) can load it. asset() honours ASSET_URL; a host-less result gets
     * the scheme + host from APP_URL.
     */
    protected function fileUrl(?string $path): ?string
    {
        if (!$path) {
            return null;
        }
        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }

        $url = asset(ltrim($path, '/'));
        if (str_starts_with($url, '/')) {
            $parts = parse_url((string) config('app.url'));
            $origin = ($parts['scheme'] ?? 'http') . '://' . ($parts['host'] ?? 'localhost')
                . (isset($parts['port']) ? ':' . $parts['port'] : '');
            $url = $origin . $url;
        }

        return $url;
    }

    /** URL for a path stored on the `public_uploads` disk (public/uploads). */
    protected function uploadUrl(?string $path): ?string
    {
        return $path ? $this->fileUrl('uploads/' . ltrim($path, '/')) : null;
    }
}
