<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Artist Management -> Artist Registration, as JSON.
 *
 * Validation, registration-number generation, uploads, awards, portfolio
 * links, status history and the set-password email live in
 * ArtistRegistrationBase (persistRegistration, artistList, previewData, ...).
 *
 *   GET   /artists                    ?search=&registration_status=&registration_type=&page=
 *   GET   /artists/form-options       ?id=  (dropdowns + existing data for the form)
 *   GET   /artists/{id}               preview
 *   POST  /artists                    create (multipart)
 *   POST  /artists/{id}               update (multipart)
 *   PATCH /artists/{id}/status        { status: approved|rejected, remarks }
 */
class ArtistRegistrationController extends ArtistRegistrationBase
{
    use ApiResponse, ConsoleScope;

    private const TYPE_LABELS = [
        'individual'    => 'Individual Artist',
        'group'         => 'Artist Group',
        'institutional' => 'Institute / Organization',
    ];

    public function index(Request $request): JsonResponse
    {
        $page = $this->artistList($this->validateListFilters($request));

        return $this->success([
            'items' => collect($page->items())->map(fn ($a) => [
                'user_id'             => (int) $a->user_id,
                'regno'               => $a->regno ?: 'AR-' . str_pad((string) $a->user_id, 8, '0', STR_PAD_LEFT),
                'registration_type'   => $a->registration_type,
                'registration_type_label' => self::TYPE_LABELS[$a->registration_type] ?? '—',
                'display_name'        => $a->display_name ?: $a->applicant_name,
                'applicant_name'      => $a->applicant_name,
                'country_name'        => $a->country_name,
                'region_name'         => $a->region_name,
                'email'               => $a->email,
                'mobile'              => $a->mobile,
                'art_form_names'      => $a->art_form_names,
                'verified_status'     => $a->verified_status === null ? null : (int) $a->verified_status,
                'registration_status' => $a->registration_status,
                'submitted_at'        => $a->submitted_at,
            ])->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page'    => $page->lastPage(),
                'per_page'     => $page->perPage(),
                'total'        => $page->total(),
                'from'         => $page->firstItem(),
                'to'           => $page->lastItem(),
            ],
            'type_labels'  => self::TYPE_LABELS,
            'status_labels'=> ['0' => 'Pending', '1' => 'Approved', '2' => 'Rejected'],
        ]);
    }

    public function formOptions(Request $request): JsonResponse
    {
        $data = $this->registrationFormData($request->integer('id') ?: null);

        // Show existing upload links on the edit form.
        foreach (['individual', 'group', 'institution'] as $key) {
            if ($data[$key]) {
                $data[$key] = $this->withFileUrls($data[$key]);
            }
        }

        return $this->success($data + ['type_labels' => self::TYPE_LABELS]);
    }

    public function show(int $id): JsonResponse
    {
        $data = $this->previewData($id);
        $artist = $data['artist'];

        if (hasCountryAccess()) {
            abort_if(
                (int) $artist->country_id !== (int) $this->countryId(),
                403,
                'You can view registrations only for your assigned country.'
            );
        }

        foreach (['individual', 'group', 'institution'] as $key) {
            if ($data[$key]) {
                $data[$key] = $this->withFileUrls($data[$key]);
            }
        }
        $data['awards'] = collect($data['awards'])->map(function ($a) {
            $a->certificate_url = $this->uploadUrl($a->certificate_path ?? null);
            return $a;
        });
        $data['type_label'] = self::TYPE_LABELS[$data['type']] ?? '—';
        // Filled from the artist's own My Profile form (India State/UT + district).
        $data['state_name'] = $artist->state ? \DB::table('states')->where('id', $artist->state)->value('StateName') : null;
        $data['district_name'] = $artist->district ? \DB::table('districts')->where('id', $artist->district)->value('DistrictName') : null;        $data['can_change_status'] = (int) $artist->verified_status === 0 && $this->can('/artist', 'edit');

        return $this->success($data);
    }

    public function store(Request $request): JsonResponse
    {
        $request->request->remove('id');
        [$artist] = $this->persistRegistration($request);

        return $this->success(
            ['id' => $artist->id, 'regno' => $artist->regno],
            'Artist registration created successfully. Account setup instructions were emailed to the applicant.',
            201
        );
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $request->merge(['id' => $id]);
        [$artist] = $this->persistRegistration($request);

        return $this->success(['id' => $artist->id], 'Artist registration updated successfully.');
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $request->merge(['id' => $id]);
        $validated = $this->applyStatusChange($request);

        return $this->success(
            ['status' => $validated['status']],
            'Artist registration ' . ucfirst($validated['status']) . ' successfully.'
        );
    }

    /** Add *_url fields for every stored upload path on a detail row. */
    private function withFileUrls(object $detail): object
    {
        $detail = clone $detail;
        foreach (['profile_photo', 'identity_document', 'institution_logo', 'authorization_letter', 'brochure_path', 'registration_certificate'] as $col) {
            if (property_exists($detail, $col)) {
                $detail->{$col . '_url'} = $this->uploadUrl($detail->{$col});
            }
        }
        foreach (['supporting_document', 'supporting_documents'] as $col) {
            if (property_exists($detail, $col)) {
                $detail->{$col . '_urls'} = collect(array_filter(explode(',', (string) $detail->{$col})))
                    ->map(fn ($p) => $this->uploadUrl(trim($p)))->values();
            }
        }

        return $detail;
    }
}
