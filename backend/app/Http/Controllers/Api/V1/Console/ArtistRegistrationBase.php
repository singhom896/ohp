<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Controller;
use App\Models\ArtistRegistration;
use App\Models\User;
use App\Notifications\SetArtistPassword;
use App\Support\ZccScope;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

/**
 * Shared artist registration logic (validation, registration numbers, uploads,
 * awards, portfolio links, status history, set-password email) used by
 * ArtistRegistrationController (Artist Management API).
 */
abstract class ArtistRegistrationBase extends Controller
{
    private const TYPES = [
        'individual' => 5,
        'group' => 6,
        'institutional' => 7,
    ];

/** Artist list filters (Artist Management). */
protected function validateListFilters(Request $request): array
{
    return $request->validate([
        'search' => ['nullable', 'string', 'max:255'],
        'registration_status' => [
            'nullable',
            Rule::in(['0', '1', '2', '3']),
        ],
        'registration_type' => [
            'nullable',
            Rule::in(array_keys(self::TYPES)),
        ],
    ]);
}

/** Paginated, display-ready registrations for the logged-in user's scope. */
protected function artistList(array $filters, int $perPage = 15)
{
    $authCountryId = authUserData('country_id');

    // Base query
    $query = DB::table('users as u')
        ->leftJoin('countries as c', 'c.id', '=', 'u.country_id')
        ->leftJoin('art_regions as r', 'r.id', '=', 'u.region_id')
        ->leftJoin('artist_registrations as ar', 'ar.user_id', '=', 'u.id')
        ->leftJoin('artist_group_details as ag', 'ag.user_id', '=', 'u.id')
        ->leftJoin('artist_institution_details as ai', 'ai.user_id', '=', 'u.id')

        // Zonal Cultural Centre officials: only artists of their member States / UTs.
        ->when(ZccScope::isZcc(), fn ($query) => ZccScope::apply($query, 'u'))

        // Country-wise access (other country-scoped roles)
        ->when(hasCountryAccess() && ! ZccScope::isZcc(), function ($query) use ($authCountryId) {
            if (empty($authCountryId)) {
                $query->whereRaw('1 = 0');
                return;
            }

            $query->where('u.country_id', $authCountryId);
        })

        ->whereIn('u.role_id', array_values(self::TYPES))

        ->where(function ($builder) {
            $builder->whereNotNull('ar.id')
                ->orWhereNotNull('ag.id')
                ->orWhereNotNull('ai.id');
        })

        ->select([
            'u.id as user_id',
            'u.regno',
            'u.role_id',
            'u.full_name as applicant_name',
            'u.email',
            'u.mobile',
            'u.dob',
            'u.gender',
            'u.city',
            'u.address',
            'u.pincode',
            'u.country_id',
            'u.region_id',
            'u.state',
            'u.verified_status',
            'c.name as country_name',
            'r.name as region_name',

            // Individual
            'ar.id as individual_id',
            'ar.art_form_id as individual_art_form_id',
            'ar.created_at as individual_submitted_at',

            // Group
            'ag.id as group_id',
            'ag.group_name',
            'ag.group_type',
            'ag.art_form_id as group_art_form_ids',
            'ag.created_at as group_submitted_at',

            // Institution
            'ai.id as institution_id',
            'ai.institution_name',
            'ai.institution_type',
            'ai.art_form_id as institution_art_form_ids',
            'ai.created_at as institution_submitted_at',
        ])
        ->selectRaw(
            'COALESCE(ar.created_at, ag.created_at, ai.created_at, u.created_at) as submitted_at'
        );

    // Registration type filter
    if (!empty($filters['registration_type'])) {
        $query->where(
            'u.role_id',
            self::TYPES[$filters['registration_type']]
        );
    }

	
	
	if (isset($filters['registration_status']) && $filters['registration_status'] !== '') {
		$query->where('u.verified_status', (int) $filters['registration_status']);
	}

    // Search filter
    if (!empty($filters['search'])) {
        $term = trim($filters['search']);

        $query->where(function ($builder) use ($term) {
            $builder->where('u.regno', 'like', '%' . $term . '%')
                ->orWhere('u.full_name', 'like', '%' . $term . '%')
                ->orWhere('u.email', 'like', '%' . $term . '%')
                ->orWhere('u.mobile', 'like', '%' . $term . '%')
                ->orWhere('ag.group_name', 'like', '%' . $term . '%')
                ->orWhere('ai.institution_name', 'like', '%' . $term . '%');
        });
    }

    // Pagination
    $artists = $query
        ->orderByDesc('submitted_at')
        ->orderByDesc('u.id')
        ->paginate($perPage)
        ->withQueryString();

    // Collect art form IDs
    $artFormIds = $artists->getCollection()
        ->flatMap(function ($artist) {
            $formIds = match ((int) $artist->role_id) {
                self::TYPES['individual'] => [
                    $artist->individual_art_form_id,
                ],
                self::TYPES['group'] => explode(
                    ',',
                    (string) $artist->group_art_form_ids
                ),
                default => explode(
                    ',',
                    (string) $artist->institution_art_form_ids
                ),
            };

            return array_filter(array_map('intval', $formIds));
        })
        ->unique()
        ->values();

    $artForms = $artFormIds->isEmpty()
        ? collect()
        : DB::table('art_forms')
            ->whereIn('id', $artFormIds)
            ->pluck('name', 'id');

    // Prepare display data
    $artists->getCollection()->transform(function ($artist) use ($artForms) {
        $artist->registration_type = array_search(
            (int) $artist->role_id,
            self::TYPES,
            true
        );

        $artist->display_name = match ($artist->registration_type) {
            'group' => $artist->group_name,
            'institutional' => $artist->institution_name,
            default => $artist->applicant_name,
        };

        $artist->art_form_names = collect(
            match ($artist->registration_type) {
                'group' => explode(',', (string) $artist->group_art_form_ids),
                'institutional' => explode(',', (string) $artist->institution_art_form_ids),
                default => [$artist->individual_art_form_id],
            }
        )
            ->map(fn ($id) => $artForms[(int) $id] ?? null)
            ->filter()
            ->implode(', ');

        // Status from users table only
        $artist->registration_status = match ((int) $artist->verified_status) {
            0 => 'pending',
            1 => 'approved',
            2 => 'rejected',
            3 => 'changes_requested',
            default => 'not tracked',
        };

        return $artist;
    });

    return $artists;
}
   

    /** Existing registration (when editing) plus every dropdown the form needs. */
    protected function registrationFormData(?int $userId): array
    {
        $authCountryId = authUserData('country_id');
        abort_if(empty($authCountryId), 403, 'Your login is not associated with a country.');

        $artist = null;
        $individual = null;
        $group = null;
        $institution = null;
        $relatedAwards = collect();
        $portfolioLinks = collect();
        $type = old('registration_type', 'individual');
        $institutionTypeId = null;

        if ($userId !== null) {
            $artist = $this->findArtistUser($userId);
            ZccScope::isZcc()
                ? ZccScope::authorize($artist)
                : abort_if((int) $artist->country_id !== (int) $authCountryId, 403, 'You can manage registrations only for your assigned country.');
            $type = array_search((int) $artist->role_id, self::TYPES, true);
            $individual = DB::table('artist_registrations')->where('user_id', $artist->id)->first();
            $group = DB::table('artist_group_details')->where('user_id', $artist->id)->first();
            $institution = DB::table('artist_institution_details')->where('user_id', $artist->id)->first();
            if ($institution) {
                $institutionTypeId = DB::table('art_institution_types')
                    ->where('name', $institution->institution_type)
                    ->value('id');
            }
            $detailId = $individual?->id ?? $group?->id ?? $institution?->id;
            $typeId = (int) $artist->role_id;

            if ($detailId) {
                $relatedAwards = DB::table('artist_awards as aa')
                    ->leftJoin('art_award_masters as am', 'am.id', '=', 'aa.award_id')
                    ->where('aa.registration_type', $typeId)
                    ->where('aa.registration_id', $detailId)
                    ->get(['aa.*', DB::raw('COALESCE(am.name, aa.award_name) as award_name')]); // master name, else typed in My Profile
                $portfolioLinks = DB::table('artist_portfolio_links')
                    ->where('registration_type', $typeId)
                    ->where('registration_id', $detailId)
                    ->pluck('portfolio_link');
            }
        }

        $countries = DB::table('countries')->where('status', 1)->where('id', $authCountryId)->orderBy('name')->get(['id', 'name']);
        // Nodal users can manage registrations only for their assigned country.
        $countryId = (int) $authCountryId;
        $regions = $countryId
            ? DB::table('art_regions')->where('country_id', $countryId)->where('status', 1)
                // ZCC officials pick only their member States / UTs.
                ->when(ZccScope::isZcc(), fn ($q) => $q->whereIn('id', ZccScope::coverage(ZccScope::zccId())['regions'] ?: [-1]))
                ->orderBy('name')->get(['id', 'name'])
            : collect();
        $artForms = $countryId
            ? DB::table('art_forms')->where('country_id', $countryId)->where('status', 1)->where('parent_id', 0)->orderBy('name')->get(['id', 'name'])
            : collect();
        $subgenres = old('art_form_id', $individual->art_form_id ?? null)
            ? DB::table('art_forms')->where('country_id', $countryId)->where('parent_id', old('art_form_id', $individual->art_form_id ?? null))->where('status', 1)->orderBy('name')->get(['id', 'name'])
            : collect();
        $groupTypeQuery = DB::table('art_group_types')->where('status', 1);
        if (Schema::hasColumn('art_group_types', 'country_id')) $groupTypeQuery->where('country_id', $countryId);
        $groupTypes = $groupTypeQuery->orderBy('name')->get(['id', 'name']);

        $institutionTypeQuery = DB::table('art_institution_types')->where('status', 1);
        if (Schema::hasColumn('art_institution_types', 'country_id')) $institutionTypeQuery->where('country_id', $countryId);
        $institutionTypes = $institutionTypeQuery->orderBy('name')->get(['id', 'name']);

        $languageQuery = DB::table('art_languages')->where('status', 1);
        if (Schema::hasColumn('art_languages', 'country_id')) $languageQuery->where('country_id', $countryId);
        $languages = $languageQuery->orderBy('name')->get(['id', 'name']);

        $awardQuery = DB::table('art_award_masters')->where('status', 1);
        if (Schema::hasColumn('art_award_masters', 'country_id')) $awardQuery->where('country_id', $countryId);
        $awardMasters = $awardQuery->orderBy('name')->get(['id', 'name']);

        return compact(
            'artist',
            'individual',
            'group',
            'institution',
            'type',
            'authCountryId',
            'institutionTypeId',
            'countries',
            'regions',
            'artForms',
            'subgenres',
            'groupTypes',
            'institutionTypes',
            'languages',
            'awardMasters',
            'relatedAwards',
            'portfolioLinks'
        );
    }

    /**
     * Validate + store a registration (user row, detail row, awards,
     * portfolio links, uploads) and email the set-password link for new ones.
     *
     * @return array{0: User, 1: bool} the artist user and whether it was created
     */
    protected function persistRegistration(Request $request): array
    {
        $authCountryId = authUserData('country_id');
        abort_if(empty($authCountryId), 403, 'Your login is not associated with a country.');

        // Ignore any country_id submitted by the browser; the logged-in nodal country is authoritative.
        $request->merge(['country_id' => (int) $authCountryId]);
        $userId = $request->input('id');
        $artist = $userId ? $this->findArtistUser((int) $userId) : null;
        if ($artist && ZccScope::isZcc()) {
            ZccScope::authorize($artist);
        } else {
            abort_if($artist && (int) $artist->country_id !== (int) $authCountryId, 403, 'You can manage registrations only for your assigned country.');
        }
        $type = (string) $request->input('registration_type');

        if (! array_key_exists($type, self::TYPES)) {
            throw ValidationException::withMessages([
                'registration_type' => 'Select a valid registration type.',
            ]);
        }
        if ($artist && (int) $artist->role_id !== self::TYPES[$type]) {
            throw ValidationException::withMessages([
                'registration_type' => 'The registration type cannot be changed.',
            ]);
        }

        $validated = $this->validateRegistration($request, $type, $artist);
        $storedPaths = [];
        $activationToken = null;

        try {
            foreach ($this->fileInputs($type) as $input => $directory) {
                if ($request->hasFile($input)) {
                    $storedPaths[$input] = $this->storeUpload($request->file($input), $directory);
                }
            }
            foreach ($request->file('supporting_documents', []) as $documentIndex => $document) {
                $storedPaths['supporting_documents'][$documentIndex] = $this->storeUpload($document, 'artists');
            }
            foreach ($request->file('awards', []) as $awardIndex => $awardFiles) {
                if (! empty($awardFiles['certificate'])) {
                    $storedPaths["award_certificate_{$awardIndex}"] = $this->storeUpload($awardFiles['certificate'], 'artist-awards');
                }
            }

            // A ZCC official may register / move artists only within its member States / UTs.
            if (ZccScope::isZcc()) {
                $zone = ZccScope::coverage(ZccScope::zccId())['regions'];
                if (! in_array((int) ($validated['region_id'] ?? 0), $zone, true)) {
                    throw ValidationException::withMessages([
                        'region_id' => 'Select a State / UT of your Zonal Cultural Centre.',
                    ]);
                }
            }

            $activationToken = $artist ? null : Str::random(64);
            if ($activationToken !== null) {
                $this->acquireRegistrationLock();
            }
            $artist = DB::transaction(function () use ($validated, $type, $artist, $storedPaths, $activationToken): User {
                $country = DB::table('countries')->where('id', $validated['country_id'])->first();
                $roleId = self::TYPES[$type];
                $representativeName = in_array($type, ['group', 'institutional'], true)
                    ? $validated['representative_name']
                    : $validated['full_name'];
                $userData = [
                    'role_id' => $roleId,
                    'country_id' => $validated['country_id'],
                    'region_id' => $validated['region_id'],
                    'city' => $validated['district_city'] ?? null,
                    'full_name' => $representativeName,
                    'firstname' => Str::before($representativeName, ' '),
                    'lastname' => Str::after($representativeName, ' ') ?: null,
                    'email' => strtolower(trim($validated['email'])),
                    'mobile' => $validated['phone'] ?? null,
                    'dob' => $type === 'individual' ? ($validated['date_of_birth'] ?? null) : null,
                    'gender' => $type === 'individual' ? ($validated['gender'] ?? null) : null,
                    'designation' => $type === 'individual' ? null : ($validated['representative_designation'] ?? null),
                    'address' => $validated['mailing_address'] ?? null,
                    'pincode' => $validated['postal'] ?? null,
                    'updated_by' => Auth::id(),
                    'updated_at' => now(),
                ];

                if ($artist) {
                    DB::table('users')->where('id', $artist->id)->update($userData);
                } else {
                    $userData['password'] = Hash::make(Str::random(64));
                    $userData['active'] = 0;
                    $userData['verified_status'] = 0;
                    $userData['created_by'] = Auth::id();
                    $userData['created_at'] = now();
                    $userId = DB::table('users')->insertGetId($userData);
                    $artist = User::query()->findOrFail($userId);
                    $artist->regno = $this->nextRegistrationNumber(
                        (string) ($country->alpha_3 ?? 'REG'),
                        $type
                    );
                    $artist->save();
                }

                $detail = match ($type) {
                    'individual' => DB::table('artist_registrations')->where('user_id', $artist->id)->first(),
                    'group' => DB::table('artist_group_details')->where('user_id', $artist->id)->first(),
                    default => DB::table('artist_institution_details')->where('user_id', $artist->id)->first(),
                };
                $detailData = $this->detailData($validated, $type, $storedPaths, $detail);

                if ($detail) {
                    DB::table($this->detailTable($type))->where('id', $detail->id)->update($detailData);
                    $detailId = (int) $detail->id;
                } else {
                    $detailData['user_id'] = $artist->id;
                    $detailData['created_at'] = now();
                    if ($type === 'individual') {
                        $detailData['status'] = ArtistRegistration::STATUS_PENDING;
                    } elseif ($type === 'group') {
                        $detailData['registration_type'] = $type;
                    }
                    $detailId = DB::table($this->detailTable($type))->insertGetId($detailData);
                }

                $this->syncPortfolioLinks($artist, $detailId, $validated);
                $this->saveAwards($artist, $detailId, $validated, $storedPaths);

                if ($activationToken !== null) {
                    DB::table('artist_account_activations')->updateOrInsert(
                        ['user_id' => $artist->id],
                        [
                            'token_hash' => hash('sha256', $activationToken),
                            'expires_at' => now()->addHours(24),
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]
                    );
                }

                return $artist;
            });
        } catch (Throwable $exception) {
            foreach ($storedPaths as $pathOrPaths) {
                foreach ((array) $pathOrPaths as $path) {
                    Storage::disk('public_uploads')->delete($path);
                }
            }

            throw $exception;
        } finally {
            if ($activationToken !== null) {
                $this->releaseRegistrationLock();
            }
        }

        if ($activationToken !== null) {
            $artist->notify(new SetArtistPassword($activationToken));
        }

        return [$artist, ! $userId];
    }

    /** Approve / reject a pending registration and write the status history. */
    protected function applyStatusChange(Request $request): array
    {
        $validated = $request->validate([
            'id' => ['required', 'integer', 'exists:users,id'],
            'status' => [
                'required',
                Rule::in([
                    ArtistRegistration::STATUS_APPROVED,
                    ArtistRegistration::STATUS_REJECTED,
                    // "Request Changes": back to the artist to correct (verified_status 3).
                    ArtistRegistration::STATUS_RETURNED,
                ]),
            ],
            'remarks' => [
                'nullable',
                'string',
                'max:5000',
                Rule::requiredIf(
                    fn () => in_array($request->input('status'), [ArtistRegistration::STATUS_REJECTED, ArtistRegistration::STATUS_RETURNED], true)
                ),
            ],
        ], [
            'remarks.required' => 'Please enter the remarks; they are shown to the artist.',
        ]);

        $authCountryId = authUserData('country_id');

        DB::transaction(function () use ($validated, $authCountryId): void {
            $user = User::query()
                ->whereIn('role_id', array_values(self::TYPES))
                ->whereKey($validated['id'])
                ->lockForUpdate()
                ->firstOrFail();

            // ZCC officials: only artists of their member States / UTs.
            if (ZccScope::isZcc()) {
                ZccScope::authorize($user);
            } elseif (hasCountryAccess()) {
                // Enforce country-level access for other country-scoped users.
                abort_if(
                    empty($authCountryId) ||
                    (int) $user->country_id !== (int) $authCountryId,
                    403,
                    'You can manage registrations only for your assigned country.'
                );
            }

            if ((int) $user->verified_status !== 0) {
                throw ValidationException::withMessages([
                    'status' => 'Only pending registrations can be approved, rejected or returned for changes.',
                ]);
            }

            $type = array_search((int) $user->role_id, self::TYPES, true);
            if ($type === false) {
                throw ValidationException::withMessages([
                    'status' => 'Invalid artist registration type.',
                ]);
            }

            // Confirm that the selected user has the relevant registration details.
            $detailExists = DB::table($this->detailTable($type))
                ->where('user_id', $user->id)
                ->exists();

            if (! $detailExists) {
                throw ValidationException::withMessages([
                    'status' => 'Registration details could not be found.',
                ]);
            }

            $oldStatus = (int) $user->verified_status;
            $newStatus = match ($validated['status']) {
                ArtistRegistration::STATUS_APPROVED => 1,
                ArtistRegistration::STATUS_RETURNED => 3,
                default => 2,
            };
            $remarks = trim($validated['remarks'] ?? '');

            DB::table('users')
                ->where('id', $user->id)
                ->update([
                    'verified_status' => $newStatus,
                    'updated_by' => Auth::id(),
                    'updated_at' => now(),
                ]);

            // Common audit history for Individual (5), Group (6), and Institution (7).
            DB::table('artist_status_histories')->insert([
                'user_id' => $user->id,
                'registration_type' => (int) $user->role_id,
                'old_status' => $oldStatus,
                'new_status' => $newStatus,
                'remarks' => $remarks !== '' ? $remarks : null,
                'created_by' => Auth::id(),
                'updated_by' => Auth::id(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        return $validated;
    }

    /** Everything the registration preview page shows. */
    protected function previewData(int $userId): array
    {
        $artist = $this->findArtistUser($userId);
        $type = array_search((int) $artist->role_id, self::TYPES, true);
        $individual = DB::table('artist_registrations')->where('user_id', $artist->id)->first();
        $group = DB::table('artist_group_details')->where('user_id', $artist->id)->first();
        $institution = DB::table('artist_institution_details')->where('user_id', $artist->id)->first();
        $detail = $individual ?? $group ?? $institution;
        abort_if(! $detail, 404);

        $country = DB::table('countries')->where('id', $artist->country_id)->value('name');
        $region = DB::table('art_regions')->where('id', $artist->region_id)->value('name');
        $artFormIds = match ($type) {
            'individual' => array_filter([$individual->art_form_id ?? null, $individual->subgenre_id ?? null]),
            'group' => explode(',', (string) ($group->art_form_id ?? '')),
            default => explode(',', (string) ($institution->art_form_id ?? '')),
        };
        $artForms = DB::table('art_forms')->whereIn('id', array_filter($artFormIds))->pluck('name', 'id');
        $detailId = (int) $detail->id;
        $typeId = (int) $artist->role_id;
        $awards = DB::table('artist_awards as aa')
            ->leftJoin('art_award_masters as am', 'am.id', '=', 'aa.award_id')
            ->where('aa.registration_type', $typeId)
            ->where('aa.registration_id', $detailId)
            ->get(['aa.*', DB::raw('COALESCE(am.name, aa.award_name) as award_name')]); // master name, else typed in My Profile
        $portfolioLinks = DB::table('artist_portfolio_links')
            ->where('registration_type', $typeId)
            ->where('registration_id', $detailId)
            ->pluck('portfolio_link');
        $languageIds = array_filter(explode(',', (string) ($individual->language_id ?? $group->language_id ?? $institution->language_id ?? '')));
        $languages = $languageIds
            ? DB::table('art_languages')->whereIn('id', $languageIds)->pluck('name')
            : collect();
        // Latest rejection reason for every registration type.
        $rejectionReason = DB::table('artist_status_histories')
            ->where('user_id', $artist->id)
            ->where('registration_type', (int) $artist->role_id)
            ->where('new_status', 2)
            ->whereNotNull('remarks')
            ->where('remarks', '<>', '')
            ->latest('id')
            ->value('remarks');

        // Latest approval remarks, if any.
        $approvalRemarks = DB::table('artist_status_histories')
            ->where('user_id', $artist->id)
            ->where('registration_type', (int) $artist->role_id)
            ->where('new_status', 1)
            ->whereNotNull('remarks')
            ->where('remarks', '<>', '')
            ->latest('id')
            ->value('remarks');

        // Remarks are supported for all three registration types now.
        $supportsRejectionRemarks = true;

        return compact(
            'artist',
            'type',
            'individual',
            'group',
            'institution',
            'country',
            'region',
            'artForms',
            'awards',
            'portfolioLinks',
            'languages',
            'rejectionReason',
            'approvalRemarks',
            'supportsRejectionRemarks'
        );
    }

    private function validateRegistration(Request $request, string $type, ?User $artist): array
    {
        $rules = [
            'id' => ['nullable', 'integer'],
            'registration_type' => ['required', Rule::in(array_keys(self::TYPES))],
            'country_id' => ['required', 'integer', Rule::in([(int) authUserData('country_id')]), Rule::exists('countries', 'id')->where('status', 1)->where('type', 1)],
            'region_id' => [
                'required',
                'integer',
                Rule::exists('art_regions', 'id')->where(fn ($query) => $query
                    ->where('status', 1)
                    ->where('country_id', $request->input('country_id'))),
            ],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($artist?->id)],
            'phone' => ['nullable', 'string', 'max:55'],
            'mailing_address' => ['nullable', 'string', 'max:255'],
            'postal' => ['nullable', 'string', 'max:30'],
            'language_ids' => ['nullable', 'array', 'max:50'],
            'language_ids.*' => ['integer', 'distinct', Rule::exists('art_languages', 'id')->where('status', 1)],
            'portfolio_links' => ['nullable', 'array', 'max:10'],
            'portfolio_links.*' => ['nullable', 'url', 'max:2048'],
            'awards' => ['nullable', 'array', 'max:10'],
            'awards.*.id' => ['nullable', 'integer'],
            'awards.*.award_id' => ['nullable', 'integer', Rule::exists('art_award_masters', 'id')->where('status', 1)],
            'awards.*.award_year' => ['nullable', 'integer', 'between:1800,'.now()->year],
            'awards.*.certificate' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
            'awards.*.description' => ['nullable', 'string', 'max:2000'],
            'id_document' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ];

        if ($type === 'individual') {
            $rules += [
                'full_name' => ['required', 'string', 'max:255'],
                 'district_city' => ['required', 'string', 'max:255'],
                'date_of_birth' => ['required', 'date', 'before_or_equal:'.now()->subYears(18)->toDateString()],
                'gender' => ['nullable', Rule::in(['1', '2', '3'])],
                'art_form_id' => ['required', 'integer', Rule::exists('art_forms', 'id')->where('country_id', $request->input('country_id'))->where('status', 1)->where('parent_id', 0)],
                'subgenre_id' => ['nullable', 'integer', Rule::exists('art_forms', 'id')->where('country_id', $request->input('country_id'))->where('status', 1)->where('parent_id', $request->input('art_form_id'))],
                'custom_art_form' => ['nullable', 'string', 'max:255'],
                'custom_subgenre' => ['nullable', 'string', 'max:255'],
                'years_of_practice' => ['nullable', 'integer', 'between:0,100'],
                'teacher_guru' => ['nullable', 'string', 'max:255'],
                'biography' => ['nullable', 'string', 'max:2000'],
                'institutional_affiliation' => ['nullable', 'string', 'max:255'],
                'profile_photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:5120'],
                'public_profile' => ['nullable', 'boolean'],
            ];
        } elseif ($type === 'group') {
            $rules += [
                'full_name' => ['required', 'string', 'max:100'],
                'representative_name' => ['required', 'string', 'max:255'],
                'representative_designation' => ['required', 'string', 'max:255'],
                'district_city' => ['required', 'string', 'max:255'],
                'group_type_id' => ['required', 'integer', Rule::exists('art_group_types', 'id')->where('status', 1)],
                'custom_group_type' => ['nullable', 'string', 'max:255'],
                'establishment_year' => ['nullable', 'integer', 'between:1800,'.now()->year],
                'registration_number' => ['nullable', 'string', 'max:255'],
                'total_members' => ['required', 'integer', 'between:1,65535'],
                'art_forms' => ['required', 'array', 'min:1', 'max:25'],
                'art_forms.*' => ['integer', 'distinct', Rule::exists('art_forms', 'id')->where('country_id', $request->input('country_id'))->where('status', 1)->where('parent_id', 0)],
                'custom_art_form' => ['nullable', 'string', 'max:255'],
                'biography' => ['required', 'string', 'max:5000'],
                'mailing_address' => ['required', 'string', 'max:255'],
                'profile_photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:5120'],
                'supporting_documents' => ['nullable', 'array', 'max:3'],
                'supporting_documents.*' => ['file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
            ];
        } else {
            $rules += [
                'full_name' => ['required', 'string', 'max:100'],
                'representative_name' => ['required', 'string', 'max:255'],
                'representative_designation' => ['required', 'string', 'max:255'],
                'district_city' => ['required', 'string', 'max:255'],
                'institution_type_id' => ['required', 'integer', Rule::exists('art_institution_types', 'id')->where('status', 1)],
                'custom_institution_type' => ['nullable', 'string', 'max:255'],
                'establishment_year' => ['nullable', 'integer', 'between:1800,'.now()->year],
                'institution_registration_type' => ['nullable', 'string', 'max:100'],
                'registration_number' => ['nullable', 'string', 'max:255'],
                'art_forms' => ['required', 'array', 'min:1', 'max:25'],
                'art_forms.*' => ['integer', 'distinct', Rule::exists('art_forms', 'id')->where('country_id', $request->input('country_id'))->where('status', 1)->where('parent_id', 0)],
                'custom_art_form' => ['nullable', 'string', 'max:255'],
                'website' => ['nullable', 'url', 'max:2048'],
                'biography' => ['required', 'string', 'max:5000'],
                'mailing_address' => ['required', 'string', 'max:255'],
                'authorization_letter' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
                'cultural_activities' => ['nullable', 'string', 'max:5000'],
                'training_research_activities' => ['nullable', 'string', 'max:5000'],
                'associated_artists' => ['nullable', 'integer', 'between:0,100000'],
                'profile_photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:5120'],
                'brochure' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:20480'],
                'major_events' => ['nullable', 'string', 'max:5000'],
                'collaborations' => ['nullable', 'string', 'max:5000'],
                'registration_certificate' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
                'supporting_documents' => ['nullable', 'array', 'max:3'],
                'supporting_documents.*' => ['file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
            ];
        }

        $validated = $request->validate($rules);
        foreach (($validated['awards'] ?? []) as $index => $award) {
            if (
                filled($award['award_year'] ?? null)
                || filled($award['description'] ?? null)
                || $request->hasFile("awards.{$index}.certificate")
            ) {
                if (blank($award['award_id'] ?? null)) {
                    throw ValidationException::withMessages([
                        "awards.{$index}.award_id" => 'Select an award for each award entry.',
                    ]);
                }
            }
        }

        $otherArtFormSelected = DB::table('art_forms')
            ->whereIn('id', $type === 'individual' ? [$validated['art_form_id']] : ($validated['art_forms'] ?? []))
            ->where('name', 'Other')
            ->exists();
        if ($otherArtFormSelected && blank($validated['custom_art_form'] ?? null)) {
            throw ValidationException::withMessages([
                'custom_art_form' => 'Please describe the selected Other art form.',
            ]);
        }

        if ($type === 'individual' && ! empty($validated['subgenre_id'])) {
            $otherSubgenre = DB::table('art_forms')->where('id', $validated['subgenre_id'])->value('name') === 'Other';
            if ($otherSubgenre && blank($validated['custom_subgenre'] ?? null)) {
                throw ValidationException::withMessages([
                    'custom_subgenre' => 'Please describe the selected Other subgenre.',
                ]);
            }
        } elseif ($type === 'group') {
            $otherGroupType = DB::table('art_group_types')->where('id', $validated['group_type_id'])->value('name') === 'Other';
            if ($otherGroupType && blank($validated['custom_group_type'] ?? null)) {
                throw ValidationException::withMessages([
                    'custom_group_type' => 'Please enter the custom group type.',
                ]);
            }
        } elseif ($type === 'institutional') {
            $otherInstitutionType = DB::table('art_institution_types')->where('id', $validated['institution_type_id'])->value('name') === 'Other';
            if ($otherInstitutionType && blank($validated['custom_institution_type'] ?? null)) {
                throw ValidationException::withMessages([
                    'custom_institution_type' => 'Please enter the custom institution type.',
                ]);
            }
        }

        if (in_array($type, ['group', 'institutional'], true) && $artist) {
            $documentColumn = $type === 'group' ? 'supporting_document' : 'supporting_documents';
            $table = $this->detailTable($type);
            $existingDocuments = DB::table($table)->where('user_id', $artist->id)->value($documentColumn);
            $existingCount = count(array_filter(explode(',', (string) $existingDocuments)));
            $newCount = count($request->file('supporting_documents', []));
            if ($existingCount + $newCount > 3) {
                throw ValidationException::withMessages([
                    'supporting_documents' => 'A maximum of three supporting documents can be stored for this registration.',
                ]);
            }
        }

        return $validated;
    }

    private function detailData(array $validated, string $type, array $storedPaths, ?object $existing): array
    {
        $languages = implode(',', array_map('intval', $validated['language_ids'] ?? []));
        $artForms = implode(',', array_map('intval', $validated['art_forms'] ?? []));

        if ($type === 'individual') {
            return [
                'art_form_id' => $validated['art_form_id'],
                'other_art_form' => $validated['custom_art_form'] ?? null,
                'subgenre_id' => $validated['subgenre_id'] ?? null,
                'other_subgenre' => $validated['custom_subgenre'] ?? null,
                'years_of_practice' => $validated['years_of_practice'] ?? null,
                'teacher_guru' => $validated['teacher_guru'] ?? null,
                'language_id' => $languages ?: null,
                'biography' => $validated['biography'] ?? null,
                'institutional_affiliation' => $validated['institutional_affiliation'] ?? null,
                'profile_photo' => $storedPaths['profile_photo'] ?? $existing->profile_photo ?? null,
                'identity_document' => $storedPaths['id_document'] ?? $existing->identity_document ?? null,
                'public_profile' => (bool) ($validated['public_profile'] ?? false),
                'updated_at' => now(),
            ];
        }

        if ($type === 'group') {
            $groupType = DB::table('art_group_types')->where('id', $validated['group_type_id'])->first();
            $newDocuments = $storedPaths['supporting_documents'] ?? [];
            $existingDocuments = array_filter(explode(',', (string) ($existing->supporting_document ?? '')));

            return [
                'group_name' => $validated['full_name'],
                'group_type_id' => $validated['group_type_id'],
                'group_type' => $groupType->name,
                'other_group_type' => $validated['custom_group_type'] ?? null,
                'establishment_year' => $validated['establishment_year'] ?? null,
                'registration_number' => $validated['registration_number'] ?? null,
                'total_members' => $validated['total_members'],
                'art_form_id' => $artForms,
                'other_art_form' => $validated['custom_art_form'] ?? null,
                'language_id' => $languages ?: null,
                'group_description' => $validated['biography'],
                'identity_document' => $storedPaths['id_document'] ?? $existing->identity_document ?? null,
                'profile_photo' => $storedPaths['profile_photo'] ?? $existing->profile_photo ?? null,
                'portfolio_link' => $existing->portfolio_link ?? null,
                'supporting_document' => implode(',', array_merge($existingDocuments, $newDocuments)) ?: null,
                'updated_at' => now(),
            ];
        }

        $institutionType = DB::table('art_institution_types')->where('id', $validated['institution_type_id'])->first();
        $newDocuments = $storedPaths['supporting_documents'] ?? [];
        $existingDocuments = array_filter(explode(',', (string) ($existing->supporting_documents ?? '')));

        return [
            'institution_name' => $validated['full_name'],
            'institution_type' => $institutionType->name,
            'other_institution_type' => $validated['custom_institution_type'] ?? null,
            'establishment_year' => $validated['establishment_year'] ?? null,
            'institution_registration_type' => $validated['institution_registration_type'] ?? null,
            'registration_number' => $validated['registration_number'] ?? null,
            'art_form_id' => $artForms,
            'other_art_form' => $validated['custom_art_form'] ?? null,
            'website' => $validated['website'] ?? null,
            'institution_description' => $validated['biography'],
            'identity_document' => $storedPaths['id_document'] ?? $existing->identity_document ?? null,
            'authorization_letter' => $storedPaths['authorization_letter'] ?? $existing->authorization_letter ?? null,
            'cultural_activities' => $validated['cultural_activities'] ?? null,
            'training_research_activities' => $validated['training_research_activities'] ?? null,
            'language_id' => $languages ?: null,
            'associated_artists' => $validated['associated_artists'] ?? null,
            'institution_logo' => $storedPaths['profile_photo'] ?? $existing->institution_logo ?? null,
            'brochure_path' => $storedPaths['brochure'] ?? $existing->brochure_path ?? null,
            'major_events' => $validated['major_events'] ?? null,
            'collaborations' => $validated['collaborations'] ?? null,
            'registration_certificate' => $storedPaths['registration_certificate'] ?? $existing->registration_certificate ?? null,
            'supporting_documents' => implode(',', array_merge($existingDocuments, $newDocuments)) ?: null,
            'updated_at' => now(),
        ];
    }

    private function saveAwards(User $artist, int $detailId, array $validated, array $storedPaths): void
    {
        foreach (($validated['awards'] ?? []) as $index => $award) {
            if (blank($award['award_id'] ?? null)) {
                continue;
            }

            $data = [
                'award_id' => $award['award_id'],
                'award_year' => $award['award_year'] ?? null,
                'description' => $award['description'] ?? null,
                'updated_at' => now(),
            ];
            if (isset($storedPaths["award_certificate_{$index}"])) {
                $data['certificate_path'] = $storedPaths["award_certificate_{$index}"];
            }

            if (! empty($award['id'])) {
                DB::table('artist_awards')
                    ->where('id', $award['id'])
                    ->where('registration_type', $artist->role_id)
                    ->where('registration_id', $detailId)
                    ->update($data);
            } else {
                $data['registration_type'] = $artist->role_id;
                $data['registration_id'] = $detailId;
                $data['certificate_path'] ??= null;
                $data['created_at'] = now();
                DB::table('artist_awards')->insert($data);
            }
        }
    }

    private function syncPortfolioLinks(User $artist, int $detailId, array $validated): void
    {
        if (! array_key_exists('portfolio_links', $validated)) {
            return;
        }

        DB::table('artist_portfolio_links')
            ->where('registration_type', $artist->role_id)
            ->where('registration_id', $detailId)
            ->delete();

        foreach (array_filter($validated['portfolio_links']) as $url) {
            DB::table('artist_portfolio_links')->insert([
                'registration_type' => $artist->role_id,
                'registration_id' => $detailId,
                'portfolio_link' => trim($url),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function fileInputs(string $type): array
    {
        $inputs = [
            'id_document' => 'artists',
            'profile_photo' => 'artists',
        ];
        if ($type === 'institutional') {
            $inputs += [
                'authorization_letter' => 'artists',
                'brochure' => 'artists',
                'registration_certificate' => 'artists',
            ];
        }

        return $inputs;
    }

    private function storeUpload(\Illuminate\Http\UploadedFile $file, string $directory): string
    {
        $path = $file->store($directory, 'public_uploads');
        if (! is_string($path)) {
            throw new RuntimeException('Unable to store the uploaded artist document. Please try again.');
        }

        return $path;
    }

    private function acquireRegistrationLock(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        $acquired = DB::selectOne('SELECT GET_LOCK(?, 15) AS acquired', ['brics_registration_number']);
        if (! $acquired || (int) $acquired->acquired !== 1) {
            throw new RuntimeException('Could not obtain the registration number lock. Please try again.');
        }
    }

    private function releaseRegistrationLock(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::select('SELECT RELEASE_LOCK(?)', ['brics_registration_number']);
        }
    }

    private function detailTable(string $type): string
    {
        return match ($type) {
            'individual' => 'artist_registrations',
            'group' => 'artist_group_details',
            default => 'artist_institution_details',
        };
    }

    private function findArtistUser(int $id): User
    {
        return User::query()
            ->select([
                'id', 'regno', 'role_id', 'country_id', 'region_id', 'state', 'district', 'city', 'full_name',
                'email', 'mobile', 'gender', 'dob', 'designation', 'address', 'pincode',
                'active', 'verified_status', 'created_at',
            ])
            ->whereIn('role_id', array_values(self::TYPES))
            ->findOrFail($id);
    }

    private function nextRegistrationNumber(string $alpha3, string $type): string
    {
        // Global OH-AI / OH-AG / OH-AO sequence (App\Support\RegistrationNumber); $alpha3 is no longer part of the ID.
        return \App\Support\RegistrationNumber::next(\App\Support\RegistrationNumber::roleForType($type));
    }
}
