<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * Dropdown data for console forms. Any signed-in console user (jwt only);
 * Nodal Agency users only get their own country.
 *
 *   GET /lookups/countries
 *   GET /lookups/countries/{country}/regions
 *   GET /lookups/countries/{country}/art-form-parents
 *   GET /lookups/options        static option lists (status, gender, ...)
 */
class LookupController extends Controller
{
    use ApiResponse, ConsoleScope;

    public function countries(): JsonResponse
    {
        $countries = DB::table('countries')
            ->where('status', 1)
            ->when($this->isNodal(), fn ($q) => $q->where('id', $this->requireNodalCountry()))
            ->orderBy('name')
            ->get(['id', 'name']);

        return $this->success(['countries' => $countries, 'locked_country_id' => $this->isNodal() ? $this->countryId() : null]);
    }

    public function regions(int $country): JsonResponse
    {
        $this->guardCountry($country);

        return $this->success(['regions' => DB::table('art_regions')
            ->where('country_id', $country)->where('status', 1)
            ->orderBy('name')->get(['id', 'name'])]);
    }

    public function artFormParents(int $country): JsonResponse
    {
        $this->guardCountry($country);

        return $this->success(['art_forms' => DB::table('art_forms')
            ->where('country_id', $country)->where('parent_id', 0)
            ->orderBy('name')->get(['id', 'name'])]);
    }

    public function options(): JsonResponse
    {
        return $this->success([
            'status'      => statusoptions(),
            'gender'      => genderOptions(),
            'page_type'   => pagetype(),
            'target_type' => targettype(),
            'menu_type'   => \App\Models\MenuItem::menuTypeOptions(),
        ]);
    }

    private function guardCountry(int $country): void
    {
        if ($this->isNodal()) {
            abort_unless($country === $this->requireNodalCountry(), 403, 'You can only access your assigned country.');
        }
    }
}
