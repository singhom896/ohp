<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Country-scoped master data (Data Management menu). One controller, one
 * config row per resource; the {resource} slug equals the module page_url.
 *
 *   GET    /masters/{resource}?country_id=   list
 *   GET    /masters/{resource}/{id}          one row
 *   POST   /masters/{resource}               create
 *   PUT    /masters/{resource}/{id}          update
 *   PATCH  /masters/{resource}/{id}/status   { status: 0|1 }
 *
 * Same rules as the Blade controllers (ArtFromController, RegionController,
 * ...): Nodal Agency (role 8) only ever sees / writes its own country.
 */
class MasterDataController extends Controller
{
    use ApiResponse, ConsoleScope;

    public const RESOURCES = [
        'art-forms' => [
            'table' => 'art_forms',
            'label' => 'Art form',
            'fields' => [
                'parent_id'   => ['required', 'integer', 'min:0'],
                'name'        => ['required', 'string', 'max:150'],
                'description' => ['nullable', 'string'],
            ],
            'messages' => [
                'parent_id.required' => 'Please select category type.',
                'name.required'      => 'Please enter art form name.',
            ],
        ],
        'artist-awards' => [
            'table' => 'art_award_masters',
            'label' => 'Award',
            'fields' => [
                'name'        => ['required', 'string', 'max:255'],
                'description' => ['nullable', 'string', 'max:500'],
            ],
            'messages' => [
                'name.required'   => 'Please enter award name.',
                'description.max' => 'Description cannot exceed 500 characters.',
            ],
        ],
        'artist-groups' => [
            'table' => 'art_group_types',
            'label' => 'Artist Group type',
            'fields' => [
                'name'        => ['required', 'string', 'max:150'],
                'description' => ['nullable', 'string', 'max:255'],
            ],
            'messages' => ['name.required' => 'Please enter group type name.'],
        ],
        'artist-institution' => [
            'table' => 'art_institution_types',
            'label' => 'Institution type',
            'fields' => [
                'name'        => ['required', 'string', 'max:150'],
                'description' => ['nullable', 'string', 'max:255'],
            ],
            'messages' => ['name.required' => 'Please enter institution type name.'],
        ],
        'artist-languages' => [
            'table' => 'art_languages',
            'label' => 'Language',
            'fields' => [
                'name'     => ['required', 'string', 'max:100'],
                'iso_code' => ['required', 'string', 'max:10'],
            ],
            'messages' => [
                'name.required'     => 'Please enter language name.',
                'iso_code.required' => 'Please enter ISO code.',
            ],
        ],
        'regions' => [
            'table' => 'art_regions',
            'label' => 'Region',
            'fields' => [
                'name'        => ['required', 'string', 'max:150'],
                'short_name'  => ['nullable', 'string', 'max:150'],
                'region_code' => ['nullable', 'integer'],
                'region_type' => ['nullable', 'string', 'max:50'],
            ],
            'messages' => ['name.required' => 'Please enter region/state/province name.'],
        ],
    ];

    public function index(Request $request): JsonResponse
    {
        $resource = $this->resource($request);
        $cfg = $this->config($resource);
        $t = $cfg['table'];

        $country = $this->isNodal()
            ? $this->requireNodalCountry()
            : ($request->integer('country_id') ?: null);

        $query = DB::table("$t as x")
            ->leftJoin('countries as c', 'c.id', '=', 'x.country_id')
            ->select('x.*', 'c.name as country_name')
            ->when($country, fn (Builder $q) => $q->where('x.country_id', $country));

        if ($resource === 'art-forms') {
            $query->leftJoin('art_forms as parent', 'parent.id', '=', 'x.parent_id')
                ->addSelect('parent.name as parent_name')
                ->orderBy('x.country_id')
                ->orderByRaw('CASE WHEN x.parent_id = 0 THEN 0 ELSE 1 END')
                ->orderBy('parent.name')
                ->orderBy('x.name');
        } else {
            $query->orderByDesc('x.id');
        }

        return $this->success([
            'items'            => $query->get(),
            'selected_country' => $country,
            'country_locked'   => $this->isNodal(),
        ]);
    }

    public function show(Request $request): JsonResponse
    {
        $id = $this->routeId($request);
        $cfg = $this->config($this->resource($request));
        $row = $this->scoped($cfg['table'])->where('id', $id)->first();
        abort_unless($row, 404, "{$cfg['label']} not found.");

        return $this->success(['item' => $row]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, $this->resource($request), null);
    }

    public function update(Request $request): JsonResponse
    {
        return $this->save($request, $this->resource($request), $this->routeId($request));
    }

    public function status(Request $request): JsonResponse
    {
        $id = $this->routeId($request);
        $cfg = $this->config($this->resource($request));
        $data = $request->validate(['status' => ['required', 'in:0,1']]);

        $query = $this->scoped($cfg['table'])->where('id', $id);
        abort_unless($query->exists(), 404, "{$cfg['label']} not found.");
        $query->update(['status' => (int) $data['status'], 'updated_at' => now()]);

        return $this->success(
            ['status' => (int) $data['status']],
            $data['status'] ? "{$cfg['label']} activated successfully." : "{$cfg['label']} deactivated successfully."
        );
    }

    // ---------------------------------------------------------------------

    private function save(Request $request, string $resource, ?int $id): JsonResponse
    {
        $cfg = $this->config($resource);
        $t = $cfg['table'];

        $existing = null;
        if ($id) {
            $existing = $this->scoped($t)->where('id', $id)->first();
            abort_unless($existing, 404, "{$cfg['label']} not found.");
        }

        $validated = $request->validate($cfg['fields'] + [
            'country_id' => [
                $this->isNodal() ? 'nullable' : 'required',
                'integer',
                Rule::exists('countries', 'id')->where('status', 1),
            ],
            'status' => ['required', 'in:0,1'],
        ], $cfg['messages'] + [
            'country_id.required' => 'Please select a country.',
            'status.required'     => 'Please select status.',
        ]);

        $countryId = $this->isNodal() ? $this->requireNodalCountry() : (int) $validated['country_id'];

        $data = ['country_id' => $countryId, 'status' => (int) $validated['status']];
        foreach (array_keys($cfg['fields']) as $field) {
            $value = $validated[$field] ?? null;
            $data[$field] = is_string($value) ? trim($value) : $value;
        }

        if ($resource === 'art-forms') {
            $this->checkArtFormParent((int) $data['parent_id'], $countryId, $id);
        }

        $data['updated_at'] = now();
        if ($id) {
            DB::table($t)->where('id', $id)->update($data);
            $message = "{$cfg['label']} updated successfully.";
        } else {
            $data['created_at'] = now();
            $id = DB::table($t)->insertGetId($data);
            $message = "{$cfg['label']} created successfully.";
        }

        return $this->success(['item' => DB::table($t)->find($id)], $message, $existing ? 200 : 201);
    }

    /** Art forms are two levels: main category (parent_id 0) and subcategory. */
    private function checkArtFormParent(int $parentId, int $countryId, ?int $id): void
    {
        if ($parentId > 0) {
            $parentOk = DB::table('art_forms')->where('id', $parentId)
                ->where('parent_id', 0)->where('country_id', $countryId)->exists();
            abort_unless($parentOk, 422, 'Please select a valid main art form for the subcategory.');
            abort_if($id && $id === $parentId, 422, 'An art form cannot be its own parent.');
            abort_if(
                $id && DB::table('art_forms')->where('parent_id', $id)->exists(),
                422,
                'This main art form has subcategories and cannot be moved under another category.'
            );
        }
    }

    private function scoped(string $table): Builder
    {
        return DB::table($table)->when(
            $this->isNodal(),
            fn (Builder $q) => $q->where('country_id', $this->requireNodalCountry())
        );
    }

    /**
     * Route parameters are read by NAME: the slug is a route default that Laravel
     * appends after {id}, so positional controller arguments would be (id, slug).
     */
    private function resource(Request $request): string
    {
        return (string) $request->route('resource');
    }

    private function routeId(Request $request): int
    {
        $id = $request->route('id');
        abort_unless(is_numeric($id) && (int) $id > 0, 404, 'Record not found.');

        return (int) $id;
    }

    private function config(string $resource): array
    {
        abort_unless(isset(self::RESOURCES[$resource]), 404, 'Unknown resource.');

        return self::RESOURCES[$resource];
    }
}
