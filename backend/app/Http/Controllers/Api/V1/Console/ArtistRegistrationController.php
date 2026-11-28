<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Models\ArtistRegistration;
use App\Models\ZonalCulturalCentre;
use App\Services\NotificationService;
use App\Support\ZccScope;
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
 *   PATCH /artists/{id}/status        { status: approved|rejected|returned, remarks }
 *                                     (returned = "Request Changes", verified_status 3)
 *
 * ZCC officials (role 8) see and act on artists of their member States / UTs
 * only (App\Support\ZccScope).
 */
class ArtistRegistrationController extends ArtistRegistrationBase
{
    use ApiResponse, ConsoleScope;

    private const TYPE_LABELS = [
        'individual'    => 'Individual Artist',
        'group'         => 'Artist Group',
        'institutional' => 'Institute / Organization',
    ];

    /** users.verified_status */
    public const STATUS_LABELS = ['0' => 'Pending', '1' => 'Approved', '2' => 'Rejected', '3' => 'Changes Requested'];

    public function __construct(private readonly NotificationService $notifications) {}

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
            'status_labels'=> self::STATUS_LABELS,
            'zcc'          => $this->zccInfo(),
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

        if (ZccScope::isZcc()) {
            ZccScope::authorize($artist);
        } elseif (hasCountryAccess()) {
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
        $data['district_name'] = $artist->district ? \DB::table('districts')->where('id', $artist->district)->value('DistrictName') : null;
        $data['can_change_status'] = (int) $artist->verified_status === 0 && $this->can('/artist', 'edit');
        $data['status_label'] = self::STATUS_LABELS[(string) (int) $artist->verified_status] ?? '—';
        // Remarks sent with the latest "Request Changes".
        $data['changesRequested'] = (int) $artist->verified_status === 3
            ? \DB::table('artist_status_histories')->where('user_id', $artist->id)->where('new_status', 3)->latest('id')->value('remarks')
            : null;
        // Every ZCC whose member States include this artist's State / UT.
        $data['zccs'] = ZonalCulturalCentre::query()->whereIn('id', ZccScope::zccIdsFor($artist))->orderBy('position')
            ->get(['id', 'code', 'name', 'headquarters']);

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
        $status = $validated['status'];
        $remarks = trim((string) ($validated['remarks'] ?? '')) ?: null;

        // In-app notification to the artist (shown on their dashboard bell).
        [$title, $body] = match ($status) {
            ArtistRegistration::STATUS_APPROVED => ['Your registration has been approved', $remarks ?? 'Your artist profile is now approved and listed on Opportunity Hub.'],
            ArtistRegistration::STATUS_RETURNED => ['Changes requested on your registration', $remarks],
            default => ['Your registration was not approved', $remarks],
        };
        $this->notifications->notify($id, $title, $body, $status === ArtistRegistration::STATUS_APPROVED ? '/application' : '/profile');

        return $this->success(
            ['status' => $status],
            match ($status) {
                ArtistRegistration::STATUS_APPROVED => 'Artist registration approved successfully.',
                ArtistRegistration::STATUS_RETURNED => 'Changes requested. The artist has been informed and can update the profile.',
                default => 'Artist registration rejected successfully.',
            }
        );
    }

    /** Signed-in ZCC official's centre and member States / UTs (null for other roles). */
    private function zccInfo(): ?array
    {
        if (! ZccScope::isZcc()) {
            return null;
        }
        $zcc = ZccScope::centre();

        return [
            'code'   => $zcc?->code,
            'name'   => $zcc?->name,
            'headquarters' => $zcc?->headquarters,
            'states' => $zcc ? \DB::table('zcc_states as z')->join('states as s', 's.id', '=', 'z.state_id')
                ->where('z.zcc_id', $zcc->id)->orderBy('s.StateName')->pluck('s.StateName') : [],
        ];
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
