<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Countries module (BRICS countries). Mirrors Backend\CountrieController. */
class CountryController extends Controller
{
    use ApiResponse, ConsoleScope;

    public function index(): JsonResponse
    {
        $countries = DB::table('countries')
            ->where('brics_flag', 1)
            ->orderBy('name')
            ->get(['id', 'name', 'alpha_2', 'alpha_3', 'country_code', 'phone_code', 'region', 'flag_image', 'status']);

        $countries->transform(function ($c) {
            $c->flag_url = $c->flag_image ? $this->fileUrl($c->flag_image) : null;
            return $c;
        });

        return $this->success(['items' => $countries]);
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:0,1']]);

        $query = DB::table('countries')->where('id', $id)
            ->when($this->isNodal(), fn ($q) => $q->where('id', $this->requireNodalCountry()));
        abort_unless($query->exists(), 404, 'Country not found.');

        $query->update(['status' => (int) $data['status'], 'updated_at' => now()]);

        return $this->success(
            ['status' => (int) $data['status']],
            $data['status'] ? 'Country activated successfully.' : 'Country deactivated successfully.'
        );
    }
}
