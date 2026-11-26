<?php

namespace App\Services;

use App\Models\ArtistRegistration;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Artist "My Profile" for the three account types, built on SNAPSHOTS so the
 * same data can be saved directly, kept as an update request (revision) or
 * applied later by a ZCC / Admin reviewer.
 *
 *   snapshot = [
 *     'type'   => individual | group | organisation,
 *     'values' => form values (ids, text, arrays, booleans, portfolio_links),
 *     'files'  => [profile_photo, identity_document, institution_logo, brochure, supporting_documents[]] (upload paths),
 *     'awards' => [[name, year, description, certificate_path], ...],
 *   ]
 *
 * Live data: users + artist_registrations / artist_group_details /
 * artist_institution_details + artist_portfolio_links + artist_awards (the
 * tables Artist Management reads). Uploads are on the public_uploads disk.
 */
class ArtistProfileService
{
    public const TYPES = [5 => 'individual', 6 => 'group', 7 => 'organisation'];

    public const TYPE_LABELS = [
        'individual'   => 'Individual Artist',
        'group'        => 'Artist Group',
        'organisation' => 'Organisation / Institute',
    ];

    public const TABLES = [
        'individual'   => 'artist_registrations',
        'group'        => 'artist_group_details',
        'organisation' => 'artist_institution_details',
    ];

    /** Masters (art forms, languages, group types) are kept per country; the portal is for India. */
    public const INDIA = 104;

    public const MAX_LINKS = 10;
    public const MAX_AWARDS = 10;
    public const MAX_DOCUMENTS = 5;

    /** users.gender codes. 1-3 are the codes used across the project. */
    public const GENDERS = [
        '2' => 'Female',
        '1' => 'Male',
        '4' => 'Transgender',
        '5' => 'Non-binary',
        '3' => 'Other',
        '6' => 'Prefer not to say',
    ];

    public const ORG_CATEGORIES = [
        'Central Government Ministry / Department' => ['Ministry', 'Department', 'Attached / Subordinate Office', 'Autonomous Body', 'Public Sector Undertaking'],
        'State Government Department / Office'     => ['Department', 'Directorate', 'District Office', 'State Akademi / Board', 'Other State Office'],
        'Local Government Body'                    => ['Municipal Corporation', 'Municipality / Nagar Palika', 'Panchayat', 'Cantonment Board', 'Other'],
        'School'                                   => ['Government School', 'Government-aided School', 'Private School', 'Kendriya / Navodaya Vidyalaya', 'Other'],
        'College / University'                     => ['Central University', 'State University', 'Deemed University', 'Private University', 'Government College', 'Private College', 'Other'],
        'Government Institution'                   => ['Research Institute', 'Training Institute', 'Museum / Library', 'Other'],
        'Cultural Institution'                     => ['Akademi', 'Cultural Centre', 'Museum / Art Gallery', 'Auditorium / Kala Kendra', 'Other'],
        'Hotel / Hospitality'                      => ['Hotel', 'Resort', 'Heritage Property', 'Banquet / Event Venue', 'Other'],
        'Private Organisation'                     => ['Company', 'Trust / Society / NGO', 'Foundation', 'Other'],
        'Event / Venue Operator'                   => ['Event Management Company', 'Venue Operator', 'Other'],
        'Other'                                    => [],
    ];

    /** Categories that normally hold a formal registration / establishment number. */
    public const ORG_REGISTRATION_REQUIRED = ['Private Organisation', 'Hotel / Hospitality', 'Event / Venue Operator'];

    /** Registration form values (RegistrationController::ORGANISATION_TYPES) -> profile categories. */
    private const ORG_CATEGORY_ALIASES = [
        'Other Government Institution'             => 'Government Institution',
        'Other Private Organisation / Institution' => 'Private Organisation',
    ];

    public const HOSTS_PROGRAMMES = ['yes' => 'Yes', 'occasionally' => 'Occasionally', 'no' => 'No'];

    public const PROGRAMME_TYPES = [
        'Cultural festivals', 'Annual functions', 'School / college events', 'Government programmes',
        'Conferences / official events', 'Public celebrations', 'Hotel / hospitality events', 'Community programmes', 'Other',
    ];

    public const AUDIENCE_SIZES = ['Below 100', '100–500', '501–1,000', '1,001–5,000', 'Above 5,000', 'Varies'];

    public const VENUE_AVAILABILITY = ['Own venue', 'Managed venue', 'Venue arranged per event', 'No fixed venue'];

    public const VENUE_TYPES = ['Auditorium', 'Open ground', 'Hall', 'Multipurpose hall', 'Hotel banquet / event space', 'Outdoor public space', 'Other'];

    public const VENUE_FACILITIES = [
        'Stage', 'Sound system', 'Lighting', 'Green room', 'Seating', 'Accessible entry',
        'Power backup', 'Projector / LED screen', 'Parking', 'Other',
    ];

    public const REPRESENTATIVE_ROLES = ['Founder', 'Group Leader', 'Manager', 'Coordinator', 'Secretary'];

    public const ORG_DESIGNATIONS = ['Principal', 'Dean', 'Cultural Coordinator', 'Nodal Officer', 'Event Manager', 'HR / Admin Officer'];

    /** Snapshot file slot => [detail table column, upload folder]. */
    private const FILE_COLUMNS = [
        'individual'   => ['profile_photo' => ['profile_photo', 'artist-registrations']],
        'group'        => ['profile_photo' => ['profile_photo', 'artists'], 'identity_document' => ['identity_document', 'artists']],
        'organisation' => ['institution_logo' => ['institution_logo', 'artists'], 'brochure' => ['brochure_path', 'artists']],
    ];

    private const BOOLEAN_VALUES = ['public_profile', 'declaration', 'privacy', 'authorisation'];

    private const NAME_REGEX = "/^[\pL\pM\s.'-]+$/u";
    private const PLACE_REGEX = "/^[\pL\pM\pN\s.,'()\/&-]+$/u";

    public function typeFor(User $user): string
    {
        $type = self::TYPES[(int) $user->role_id] ?? null;
        if (! $type) {
            throw new RuntimeException('Not an artist account.');
        }

        return $type;
    }

    public function detailFor(User $user): ?object
    {
        return DB::table(self::TABLES[$this->typeFor($user)])->where('user_id', $user->id)->first();
    }

    // =================================================================== snapshots

    /** The live profile as a snapshot. */
    public function snapshotFor(User $user): array
    {
        $type = $this->typeFor($user);
        $detail = $this->detailFor($user);

        $files = ['supporting_documents' => []];
        foreach (self::FILE_COLUMNS[$type] as $slot => [$column]) {
            $files[$slot] = $detail->{$column} ?? null;
        }
        if ($type !== 'individual') {
            $column = $type === 'group' ? 'supporting_document' : 'supporting_documents';
            $files['supporting_documents'] = $this->splitPaths($detail->{$column} ?? null);
        } else {
            unset($files['supporting_documents']);
        }

        $awards = $detail ? DB::table('artist_awards as a')
            ->leftJoin('art_award_masters as m', 'm.id', '=', 'a.award_id')
            ->where('a.registration_type', (int) $user->role_id)
            ->where('a.registration_id', $detail->id)
            ->orderBy('a.id')
            ->get(['a.award_name', 'm.name as master_name', 'a.award_year', 'a.description', 'a.certificate_path'])
            ->map(fn ($a) => [
                'name'             => (string) ($a->award_name ?: $a->master_name),
                'year'             => $a->award_year ? (string) $a->award_year : '',
                'description'      => (string) $a->description,
                'certificate_path' => $a->certificate_path ?: null,
            ])->all() : [];

        return [
            'type'   => $type,
            'values' => $this->normalizeValues($this->liveValues($user, $type, $detail)),
            'files'  => $files,
            'awards' => $awards,
        ];
    }

    /**
     * New snapshot from a submitted form: new uploads are stored now; files kept
     * from $base unless replaced or removed. $stored collects new paths (for cleanup on failure).
     */
    public function makeSnapshot(Request $request, User $user, array $data, array $base, array &$stored): array
    {
        $type = $this->typeFor($user);
        $files = $base['files'] ?? [];

        foreach (self::FILE_COLUMNS[$type] as $slot => [, $dir]) {
            if ($request->hasFile($slot)) {
                $files[$slot] = $stored[] = $this->store($request->file($slot), $dir);
            }
        }
        if ($type !== 'individual') {
            $keep = array_values(array_intersect($base['files']['supporting_documents'] ?? [], (array) ($data['keep_documents'] ?? [])));
            foreach ($request->file('supporting_documents', []) as $file) {
                $keep[] = $stored[] = $this->store($file, 'artists');
            }
            $files['supporting_documents'] = $keep;
        }

        $baseAwards = $base['awards'] ?? [];
        $awards = [];
        foreach (($data['awards'] ?? []) as $i => $award) {
            $kept = isset($award['ref']) && preg_match('/^a(\d+)$/', (string) $award['ref'], $m) ? ($baseAwards[(int) $m[1]] ?? null) : null;
            $file = $request->file("awards.$i.certificate");
            $awards[] = [
                'name'             => trim((string) $award['name']),
                'year'             => isset($award['year']) && $award['year'] !== '' ? (string) (int) $award['year'] : '',
                'description'      => trim((string) ($award['description'] ?? '')),
                'certificate_path' => $file ? ($stored[] = $this->store($file, 'artist-awards')) : ($kept['certificate_path'] ?? null),
            ];
        }

        $values = collect($data)->except(['awards', 'keep_documents', 'supporting_documents', ...array_keys(self::FILE_COLUMNS[$type])])->all();
        $values['portfolio_links'] = array_values(array_unique(array_filter(array_map('trim', $data['portfolio_links'] ?? []))));

        return [
            'type'   => $type,
            'values' => $this->normalizeValues($values + $this->emptyValues($type)),
            'files'  => $files,
            'awards' => $awards,
        ];
    }

    /** Write a snapshot to the live tables. Old files no longer referenced are deleted after commit. */
    public function apply(User $user, array $snapshot, int $actorId): void
    {
        $type = $this->typeFor($user);
        $table = self::TABLES[$type];
        $before = $this->snapshotFor($user);
        $v = $snapshot['values'];

        DB::transaction(function () use ($user, $type, $table, $v, $snapshot, $actorId) {
            DB::table('users')->where('id', $user->id)->update($this->userData($user, $type, $v, $actorId));

            $row = $this->detailData($type, $v, $snapshot['files'] ?? []) + ['updated_at' => now()];
            $detail = DB::table($table)->where('user_id', $user->id)->first();
            if ($detail) {
                DB::table($table)->where('id', $detail->id)->update($row);
                $detailId = (int) $detail->id;
            } else {
                $row += ['user_id' => $user->id, 'created_at' => now()];
                if ($type === 'individual') {
                    $row['status'] = ArtistRegistration::STATUS_PENDING;
                } elseif ($type === 'group') {
                    $row['registration_type'] = 'group';
                }
                $detailId = (int) DB::table($table)->insertGetId($row);
            }

            $roleId = (int) $user->role_id;
            DB::table('artist_portfolio_links')->where('registration_type', $roleId)->where('registration_id', $detailId)->delete();
            foreach ($v['portfolio_links'] ?? [] as $url) {
                DB::table('artist_portfolio_links')->insert([
                    'registration_type' => $roleId, 'registration_id' => $detailId, 'portfolio_link' => $url,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            DB::table('artist_awards')->where('registration_type', $roleId)->where('registration_id', $detailId)->delete();
            foreach ($snapshot['awards'] ?? [] as $award) {
                DB::table('artist_awards')->insert([
                    'registration_type' => $roleId, 'registration_id' => $detailId, 'award_id' => null,
                    'award_name' => $award['name'], 'award_year' => $award['year'] !== '' ? (int) $award['year'] : null,
                    'description' => $award['description'] ?: null, 'certificate_path' => $award['certificate_path'],
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });

        // Files only the old live data used (replaced / removed) are no longer needed.
        // afterCommit runs at once when no outer transaction is open.
        $gone = array_diff($this->documentPaths($before), $this->documentPaths($snapshot));
        DB::afterCommit(function () use ($gone) {
            foreach ($gone as $path) {
                Storage::disk('public_uploads')->delete($path);
            }
        });
    }

    /** Every upload path a snapshot refers to. */
    public function documentPaths(array $snapshot): array
    {
        $paths = [];
        foreach ($snapshot['files'] ?? [] as $slot => $value) {
            foreach ((array) $value as $p) {
                if ($p) {
                    $paths[] = $p;
                }
            }
        }
        foreach ($snapshot['awards'] ?? [] as $a) {
            if (! empty($a['certificate_path'])) {
                $paths[] = $a['certificate_path'];
            }
        }

        return array_values(array_unique($paths));
    }

    /** Fields that differ between two snapshots (for the audit trail). */
    public function changesBetween(array $before, array $after): array
    {
        return collect($this->compare($before, $after))
            ->where('status', '!=', 'unchanged')
            ->map(fn ($row) => ['field' => $row['field'], 'label' => $row['label'], 'before' => $row['before'], 'after' => $row['after']])
            ->values()->all();
    }

    /** Percent of the main profile fields filled in. */
    public function completion(array $snapshot): int
    {
        $v = $snapshot['values'];
        $keys = match ($snapshot['type']) {
            'individual'   => ['full_name', 'mobile', 'state_id', 'district_id', 'art_form_id', 'subgenre_id', 'biography', 'language_ids', 'portfolio_links', 'dob', 'gender', 'city'],
            'group'        => ['group_name', 'group_type_id', 'total_members', 'primary_art_form_id', 'group_description', 'full_name', 'designation', 'mobile', 'address', 'state_id', 'district_id', 'language_ids', 'portfolio_links'],
            default        => ['institution_name', 'category', 'institution_description', 'full_name', 'designation', 'mobile', 'address', 'state_id', 'district_id', 'hosts_programmes', 'art_form_ids', 'language_ids', 'portfolio_links'],
        };
        $filled = count(array_filter($keys, fn ($k) => ! empty($v[$k])));
        $photo = $snapshot['files']['profile_photo'] ?? $snapshot['files']['institution_logo'] ?? null;

        return (int) round(100 * ($filled + ($photo ? 1 : 0)) / (count($keys) + 1));
    }

    // =================================================================== comparison

    /**
     * Field-by-field comparison for reviewers: [field, label, section, before, after, status].
     * status: unchanged | changed | added | removed.
     */
    public function compare(array $before, array $after): array
    {
        $type = $after['type'] ?? $before['type'];
        $lookups = $this->lookups();
        $rows = [];
        foreach ($this->fieldLabels($type) as $field => [$label, $section]) {
            $b = $this->display($field, $before['values'][$field] ?? null, $before['values'], $lookups);
            $a = $this->display($field, $after['values'][$field] ?? null, $after['values'], $lookups);
            $rows[] = ['field' => $field, 'label' => $label, 'section' => $section, 'before' => $b, 'after' => $a, 'status' => $this->status($b, $a)];
        }

        foreach ($this->fileLabels($type) as $slot => $label) {
            $b = $this->fileDisplay($before['files'][$slot] ?? null);
            $a = $this->fileDisplay($after['files'][$slot] ?? null);
            $status = ($before['files'][$slot] ?? null) == ($after['files'][$slot] ?? null) ? 'unchanged' : $this->status($b, $a, true);
            $rows[] = ['field' => $slot, 'label' => $label, 'section' => 'Documents', 'before' => $b, 'after' => $a, 'status' => $status];
        }

        $fmt = fn (array $aw) => implode("\n", array_map(fn ($x) => trim($x['name'].($x['year'] !== '' ? ' ('.$x['year'].')' : '').($x['description'] !== '' ? ' – '.$x['description'] : '').(! empty($x['certificate_path']) ? ' [certificate]' : '')), $aw));
        $b = $fmt($before['awards'] ?? []);
        $a = $fmt($after['awards'] ?? []);
        $sameAwards = json_encode($before['awards'] ?? []) === json_encode($after['awards'] ?? []);
        $rows[] = ['field' => 'awards', 'label' => 'Awards & Recognition', 'section' => 'Awards', 'before' => $b, 'after' => $a, 'status' => $sameAwards ? 'unchanged' : $this->status($b, $a, true)];

        return $rows;
    }

    private function status(string $before, string $after, bool $forceChanged = false): string
    {
        if ($before === $after && ! $forceChanged) {
            return 'unchanged';
        }
        if ($before === '' && $after !== '') {
            return 'added';
        }
        if ($before !== '' && $after === '') {
            return 'removed';
        }

        return $before === $after ? 'unchanged' : 'changed';
    }

    private function lookups(): array
    {
        return [
            'states'    => DB::table('states')->pluck('StateName', 'id'),
            'districts' => DB::table('districts')->pluck('DistrictName', 'id'),
            'art_forms' => DB::table('art_forms')->pluck('name', 'id'),
            'languages' => DB::table('art_languages')->pluck('name', 'id'),
            'groups'    => DB::table('art_group_types')->pluck('name', 'id'),
        ];
    }

    private function display(string $field, mixed $value, array $values, array $lk): string
    {
        $names = fn (Collection $map, $ids) => collect((array) $ids)->map(fn ($id) => $map[(int) $id] ?? null)->filter()->sort()->implode(', ');

        return match ($field) {
            'state_id'      => (string) ($lk['states'][(int) $value] ?? ''),
            'district_id'   => (string) ($lk['districts'][(int) $value] ?? ''),
            'art_form_id', 'primary_art_form_id' => (string) ($lk['art_forms'][(int) $value] ?? ''),
            'subgenre_id'   => $value === 'other' ? 'Other: '.($values['other_subgenre'] ?? '') : (string) ($lk['art_forms'][(int) $value] ?? ''),
            'other_art_form_ids', 'art_form_ids' => $names($lk['art_forms'], $value),
            'language_ids'  => $names($lk['languages'], $value),
            'group_type_id' => (string) ($lk['groups'][(int) $value] ?? ''),
            'gender'        => (string) (self::GENDERS[(string) $value] ?? ''),
            'hosts_programmes' => (string) (self::HOSTS_PROGRAMMES[(string) $value] ?? ''),
            'public_profile', 'declaration', 'privacy', 'authorisation' => $value ? 'Yes' : 'No',
            'portfolio_links' => implode("\n", (array) $value),
            default         => is_array($value) ? implode(', ', $value) : trim((string) $value),
        };
    }

    private function fileDisplay(mixed $value): string
    {
        $paths = array_filter((array) $value);

        return implode("\n", array_map('basename', $paths));
    }

    /** field => [label, section] in form order. */
    public function fieldLabels(string $type): array
    {
        $contact = [
            'mobile' => ['Mobile Number', 'Contact & Location'], 'state_id' => ['State / UT', 'Contact & Location'],
            'district_id' => ['District', 'Contact & Location'], 'city' => ['City / Town', 'Contact & Location'],
            'pincode' => ['PIN Code', 'Contact & Location'],
        ];
        $common = [
            'language_ids' => ['Languages', 'Profile'], 'portfolio_links' => ['Work Sample / Portfolio Links', 'Links'],
            'public_profile' => ['Public Profile Consent', 'Declarations'],
        ];

        return match ($type) {
            'individual' => [
                'full_name' => ['Full Name', 'Identity'], 'stage_name' => ['Stage Name', 'Identity'], 'dob' => ['Date of Birth', 'Identity'],
                'gender' => ['Gender', 'Identity'], 'art_form_id' => ['Primary Art Category', 'Profile'], 'subgenre_id' => ['Specific Art Form', 'Profile'],
                'art_tradition' => ['Art Form Details / Tradition', 'Profile'], 'years_of_practice' => ['Years of Practice', 'Profile'],
                'biography' => ['Artist Introduction', 'Profile'], 'institutional_affiliation' => ['Affiliation', 'Profile'],
            ] + $contact + $common,
            'group' => [
                'group_name' => ['Group Name', 'Group'], 'group_type_id' => ['Group Type', 'Group'], 'other_group_type' => ['Other Group Type', 'Group'],
                'establishment_year' => ['Year of Establishment', 'Group'], 'registration_number' => ['Registration Number', 'Group'],
                'total_members' => ['Total Members', 'Group'], 'primary_art_form_id' => ['Primary Art Form', 'Group'],
                'other_art_form_ids' => ['Other Art Forms', 'Group'], 'group_description' => ['Group Description', 'Group'],
                'full_name' => ['Representative Name', 'Representative'], 'designation' => ['Designation / Role', 'Representative'],
                'address' => ['Address', 'Contact & Location'],
            ] + $contact + $common,
            default => [
                'institution_name' => ['Organisation Name', 'Organisation'], 'category' => ['Category', 'Organisation'],
                'sub_category' => ['Sub-category', 'Organisation'], 'establishment_year' => ['Year of Establishment', 'Organisation'],
                'registration_number' => ['Registration / Ref. No.', 'Organisation'], 'website' => ['Website', 'Organisation'],
                'institution_description' => ['About the Organisation', 'Organisation'],
                'full_name' => ['Contact Person', 'Representative'], 'designation' => ['Designation', 'Representative'],
                'address' => ['Office Address', 'Contact & Location'],
                'hosts_programmes' => ['Hosts Cultural Programmes', 'Hosting'], 'programme_types' => ['Programme Types', 'Hosting'],
                'art_form_ids' => ['Preferred Art Forms', 'Hosting'], 'audience_size' => ['Audience Size', 'Hosting'],
                'venue_availability' => ['Venue Availability', 'Venue'], 'venue_types' => ['Venue Types', 'Venue'],
                'venue_facilities' => ['Venue Facilities', 'Venue'], 'venue_locations' => ['Venue Locations', 'Venue'],
                'major_events' => ['Major Events', 'Portfolio'], 'collaborations' => ['Collaborations', 'Portfolio'],
            ] + $contact + $common,
        };
    }

    public function fileLabels(string $type): array
    {
        return match ($type) {
            'individual' => ['profile_photo' => 'Profile Photograph'],
            'group'      => ['profile_photo' => 'Group Photograph', 'identity_document' => 'Identity / Authorisation Document', 'supporting_documents' => 'Supporting Documents'],
            default      => ['institution_logo' => 'Organisation Logo', 'brochure' => 'Brochure', 'supporting_documents' => 'Supporting Documents'],
        };
    }

    // =================================================================== validation

    /** Validate a submitted profile form. $base = snapshot the edit starts from (for kept documents). */
    public function validate(Request $request, User $user, array $base): array
    {
        $type = $this->typeFor($user);
        $year = (int) now()->year;
        $stateCode = DB::table('states')->where('id', $request->integer('state_id'))->value('StateCode');
        $topArtForm = Rule::exists('art_forms', 'id')->where('country_id', self::INDIA)->where('status', 1)->where('parent_id', 0);
        $optionalPlace = $type === 'individual' ? 'nullable' : 'required';

        $rules = [
            'mobile'      => ['required', 'regex:/^[6-9][0-9]{9}$/', Rule::unique('users', 'mobile')->ignore($user->id)],
            'state_id'    => ['required', 'integer', Rule::exists('states', 'id')],
            'district_id' => ['required', 'integer', Rule::exists('districts', 'id')->where('StateCode', $stateCode ?? -1)],
            'city'        => [$optionalPlace, 'string', 'max:100', 'regex:'.self::PLACE_REGEX],
            'pincode'     => [$optionalPlace, 'regex:/^[1-9][0-9]{5}$/'],

            'language_ids'   => ['nullable', 'array', 'max:20'],
            'language_ids.*' => ['integer', 'distinct', Rule::exists('art_languages', 'id')->where('country_id', self::INDIA)->where('status', 1)],

            'portfolio_links'   => ['nullable', 'array', 'max:'.self::MAX_LINKS],
            'portfolio_links.*' => ['nullable', 'url:https', 'max:2048'],

            'awards'               => ['nullable', 'array', 'max:'.self::MAX_AWARDS],
            'awards.*.ref'         => ['nullable', 'string', 'max:10'],
            'awards.*.name'        => ['required', 'string', 'max:255'],
            'awards.*.year'        => ['nullable', 'integer', "between:1900,$year"],
            'awards.*.description' => ['nullable', 'string', 'max:500'],
            'awards.*.certificate' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:2048'],

            'public_profile' => ['nullable', 'boolean'],
            'declaration'    => ['accepted'],
        ];

        $messages = [
            'mobile.regex'          => 'Enter a valid 10-digit Indian mobile number.',
            'mobile.unique'         => 'This mobile number is already registered with another account.',
            'pincode.regex'         => 'Enter a valid 6-digit PIN code.',
            'district_id.exists'    => 'Select a district of the selected State / UT.',
            'portfolio_links.*.url' => 'Each link must be a valid https:// address.',
            'declaration.accepted'  => 'Please confirm that the information is accurate.',
            'privacy.accepted'      => 'Please accept the Privacy Policy / data processing consent.',
            'authorisation.accepted'=> 'Please confirm that you are authorised to manage this organisation account.',
            'awards.*.name.required'=> 'Enter the award / recognition name.',
            'other_subgenre.required_if' => 'Enter the name of your art form.',
            'regex'                 => 'The :attribute contains characters that are not allowed.',
            'programme_types.required' => 'Select the types of programmes you host.',
        ];

        if ($type === 'individual') {
            $artFormId = $request->integer('art_form_id');
            $rules += [
                'full_name'       => ['required', 'string', 'min:2', 'max:150', 'regex:'.self::NAME_REGEX],
                'stage_name'      => ['nullable', 'string', 'max:150'],
                'dob'             => ['nullable', 'date', 'after:1900-01-01', 'before:today'],
                'gender'          => ['nullable', Rule::in(array_keys(self::GENDERS))],
                'art_form_id'     => ['required', 'integer', $topArtForm],
                'subgenre_id'     => ['required', function (string $attr, mixed $value, Closure $fail) use ($artFormId) {
                    if ($value === 'other') {
                        return;
                    }
                    $ok = ctype_digit((string) $value) && DB::table('art_forms')->where('id', (int) $value)
                        ->where('parent_id', $artFormId)->where('status', 1)->exists();
                    if (! $ok) {
                        $fail('Select a specific art form of the selected category.');
                    }
                }],
                'other_subgenre'  => ['nullable', 'required_if:subgenre_id,other', 'string', 'max:150'],
                'art_tradition'   => ['nullable', 'string', 'max:255'],
                'years_of_practice' => ['nullable', 'integer', 'between:0,100'],
                'biography'       => ['required', 'string', 'max:500'],
                'institutional_affiliation' => ['nullable', 'string', 'max:255'],
                'profile_photo'   => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
            ];
        } elseif ($type === 'group') {
            $groupType = DB::table('art_group_types')->where('id', $request->integer('group_type_id'))->value('name');
            $rules += [
                'group_name'      => ['required', 'string', 'min:2', 'max:150', 'regex:'.self::PLACE_REGEX,
                    function (string $attr, mixed $value, Closure $fail) use ($user) {
                        $name = mb_strtolower(trim((string) $value));
                        $taken = DB::table('artist_group_details')->where('user_id', '!=', $user->id)
                            ->whereRaw('LOWER(TRIM(group_name)) = ?', [$name])->exists()
                            || DB::table('users')->where('role_id', 6)->where('id', '!=', $user->id)->where('active', 1)
                                ->whereRaw('LOWER(TRIM(account_name)) = ?', [$name])->exists();
                        if ($taken) {
                            $fail('A group with this name is already registered.');
                        }
                    }],
                'group_type_id'   => ['required', 'integer', Rule::exists('art_group_types', 'id')->where('country_id', self::INDIA)->where('status', 1)],
                'other_group_type'=> [$groupType === 'Other' ? 'required' : 'nullable', 'string', 'max:150'],
                'establishment_year' => ['nullable', 'integer', "between:1800,$year"],
                'registration_number' => [Str::startsWith((string) $groupType, 'Registered') ? 'required' : 'nullable', 'string', 'max:100'],
                'total_members'   => ['required', 'integer', 'between:1,10000'],
                'primary_art_form_id' => ['required', 'integer', $topArtForm],
                'other_art_form_ids'  => ['nullable', 'array', 'max:20'],
                'other_art_form_ids.*'=> ['integer', 'distinct', $topArtForm],
                'group_description' => ['required', 'string', 'max:5000', $this->maxWords(500)],
                'full_name'       => ['required', 'string', 'min:2', 'max:150', 'regex:'.self::NAME_REGEX],
                'designation'     => ['required', 'string', 'max:100'],
                'address'         => ['required', 'string', 'max:500'],
                'identity_document' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:2048'],
                'profile_photo'   => ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:2048'],
                'supporting_documents'   => ['nullable', 'array'],
                'supporting_documents.*' => ['file', 'mimes:pdf,jpg,jpeg,png', 'max:2048'],
                'keep_documents'  => ['nullable', 'array'],
                'keep_documents.*'=> ['string'],
                'privacy'         => ['accepted'],
            ];
        } else {
            $category = (string) $request->input('category');
            $rules += [
                'institution_name' => ['required', 'string', 'min:2', 'max:200', 'regex:'.self::PLACE_REGEX],
                'category'        => ['required', Rule::in(array_keys(self::ORG_CATEGORIES))],
                'sub_category'    => ['nullable', Rule::in(self::ORG_CATEGORIES[$category] ?? [])],
                'establishment_year' => ['nullable', 'integer', "between:1800,$year"],
                'registration_number' => [in_array($category, self::ORG_REGISTRATION_REQUIRED, true) ? 'required' : 'nullable', 'string', 'max:100'],
                'website'         => ['nullable', 'url:http,https', 'max:255'],
                'institution_description' => ['required', 'string', 'max:5000', $this->maxWords(500)],
                'full_name'       => ['required', 'string', 'min:2', 'max:150', 'regex:'.self::NAME_REGEX],
                'designation'     => ['required', 'string', 'max:100'],
                'address'         => ['required', 'string', 'max:500'],
                'hosts_programmes'=> ['required', Rule::in(array_keys(self::HOSTS_PROGRAMMES))],
                'programme_types' => [$request->input('hosts_programmes') === 'no' ? 'nullable' : 'required', 'array'],
                'programme_types.*' => [Rule::in(self::PROGRAMME_TYPES)],
                'art_form_ids'    => ['nullable', 'array', 'max:20'],
                'art_form_ids.*'  => ['integer', 'distinct', $topArtForm],
                'audience_size'   => ['nullable', Rule::in(self::AUDIENCE_SIZES)],
                'venue_availability' => ['nullable', Rule::in(self::VENUE_AVAILABILITY)],
                'venue_types'     => ['nullable', 'array'],
                'venue_types.*'   => [Rule::in(self::VENUE_TYPES)],
                'venue_facilities'=> ['nullable', 'array'],
                'venue_facilities.*' => [Rule::in(self::VENUE_FACILITIES)],
                'venue_locations' => ['nullable', 'string', 'max:500'],
                'institution_logo'=> ['nullable', 'image', 'mimes:jpg,jpeg,png', 'max:5120'],
                'brochure'        => ['nullable', 'file', 'mimes:pdf', 'max:5120'],
                'major_events'    => ['nullable', 'string', 'max:5000', $this->maxWords(500)],
                'collaborations'  => ['nullable', 'string', 'max:2000'],
                'supporting_documents'   => ['nullable', 'array'],
                'supporting_documents.*' => ['file', 'mimes:pdf,jpg,jpeg,png', 'max:5120'],
                'keep_documents'  => ['nullable', 'array'],
                'keep_documents.*'=> ['string'],
                'authorisation'   => ['accepted'],
                'privacy'         => ['accepted'],
            ];
        }

        $data = $request->validate($rules, $messages, $this->attributeNames());

        // Supporting documents: kept files must come from the base snapshot; at most 5 in total.
        if ($type !== 'individual') {
            $data['keep_documents'] = array_values(array_intersect($base['files']['supporting_documents'] ?? [], $data['keep_documents'] ?? []));
            if (count($data['keep_documents']) + count($request->file('supporting_documents', [])) > self::MAX_DOCUMENTS) {
                throw ValidationException::withMessages([
                    'supporting_documents' => 'You can keep at most '.self::MAX_DOCUMENTS.' supporting documents.',
                ]);
            }
        }

        return $data;
    }

    private function maxWords(int $max): Closure
    {
        return function (string $attr, mixed $value, Closure $fail) use ($max) {
            if (count(preg_split('/\s+/u', trim((string) $value), -1, PREG_SPLIT_NO_EMPTY)) > $max) {
                $fail("The :attribute may not be longer than $max words.");
            }
        };
    }

    private function attributeNames(): array
    {
        return [
            'full_name' => 'full name', 'stage_name' => 'stage name', 'dob' => 'date of birth',
            'art_form_id' => 'primary art category', 'subgenre_id' => 'specific art form', 'other_subgenre' => 'art form name',
            'art_tradition' => 'art form details / tradition', 'biography' => 'artist introduction',
            'state_id' => 'State / Union Territory', 'district_id' => 'district', 'city' => 'city / town / village',
            'pincode' => 'PIN code', 'group_name' => 'group name', 'group_type_id' => 'group type', 'other_group_type' => 'group type',
            'total_members' => 'total number of members', 'primary_art_form_id' => 'primary art form',
            'group_description' => 'group description', 'designation' => 'designation / role', 'address' => 'address',
            'institution_name' => 'organisation / institution name', 'category' => 'organisation category',
            'sub_category' => 'organisation sub-category', 'institution_description' => 'about the organisation',
            'hosts_programmes' => 'cultural programmes', 'major_events' => 'major events / programmes',
            'registration_number' => 'registration number', 'establishment_year' => 'year of establishment',
            'awards.*.year' => 'award year', 'awards.*.description' => 'award description', 'awards.*.certificate' => 'award certificate',
            'supporting_documents.*' => 'supporting document', 'institution_logo' => 'organisation logo', 'brochure' => 'brochure',
            'identity_document' => 'identity / authorisation document', 'profile_photo' => 'photograph',
        ];
    }

    // =================================================================== live <-> values

    private function store(UploadedFile $file, string $dir): string
    {
        $path = $file->store($dir, 'public_uploads');
        if (! is_string($path)) {
            throw new RuntimeException('The file could not be saved. Please try again.');
        }

        return $path;
    }

    private function splitPaths(?string $csv): array
    {
        return array_values(array_filter(array_map('trim', explode(',', (string) $csv))));
    }

    /** Every value key for a type, empty, so snapshots always have the same shape. */
    private function emptyValues(string $type): array
    {
        $keys = array_keys($this->fieldLabels($type));
        $keys = array_merge($keys, ['other_subgenre', 'declaration', 'privacy', 'authorisation']);

        return array_fill_keys($keys, null);
    }

    /** Same types everywhere: ids as ints, lists sorted for ids, '' for empty text, real booleans. */
    private function normalizeValues(array $v): array
    {
        foreach ($v as $k => $value) {
            if (in_array($k, self::BOOLEAN_VALUES, true)) {
                $v[$k] = filter_var($value, FILTER_VALIDATE_BOOLEAN);
            } elseif (in_array($k, ['language_ids', 'other_art_form_ids', 'art_form_ids'], true)) {
                $ids = array_values(array_unique(array_map('intval', (array) $value)));
                sort($ids);
                $v[$k] = $ids;
            } elseif (in_array($k, ['programme_types', 'venue_types', 'venue_facilities', 'portfolio_links'], true)) {
                $v[$k] = array_values(array_filter(array_map(fn ($x) => trim((string) $x), (array) $value), 'strlen'));
            } elseif (is_array($value)) {
                $v[$k] = $value;
            } else {
                $v[$k] = $value === null ? '' : trim((string) $value);
            }
        }

        return $v;
    }

    private function liveValues(User $user, string $type, ?object $detail): array
    {
        $ids = fn (?string $csv) => array_values(array_filter(array_map('intval', explode(',', (string) $csv))));
        $list = fn (?string $csv) => array_values(array_filter(array_map('trim', explode(',', (string) $csv))));
        $links = $detail
            ? DB::table('artist_portfolio_links')->where('registration_type', (int) $user->role_id)
                ->where('registration_id', $detail->id)->orderBy('id')->pluck('portfolio_link')->all()
            : [];

        $common = [
            'full_name'       => (string) $user->full_name,
            'mobile'          => (string) $user->mobile,
            'state_id'        => $user->state ? (string) $user->state : '',
            'district_id'     => $user->district ? (string) $user->district : '',
            'city'            => (string) $user->city,
            'pincode'         => (string) $user->pincode,
            'language_ids'    => $ids($detail->language_id ?? null),
            'portfolio_links' => $links,
            'public_profile'  => (bool) ($detail->public_profile ?? false),
            'declaration'     => (bool) ($detail->declaration_accepted_at ?? false),
        ];

        if ($type === 'individual') {
            return $common + [
                'stage_name'        => (string) ($detail->stage_name ?? ''),
                'dob'               => $user->dob ? substr((string) $user->dob, 0, 10) : '',
                'gender'            => $user->gender !== null ? (string) $user->gender : '',
                'art_form_id'       => isset($detail->art_form_id) ? (string) $detail->art_form_id : '',
                'subgenre_id'       => isset($detail->subgenre_id) ? (string) $detail->subgenre_id : (! empty($detail->other_subgenre) ? 'other' : ''),
                'other_subgenre'    => (string) ($detail->other_subgenre ?? ''),
                'art_tradition'     => (string) ($detail->art_tradition ?? ''),
                'years_of_practice' => isset($detail->years_of_practice) ? (string) $detail->years_of_practice : '',
                'biography'         => (string) ($detail->biography ?? ''),
                'institutional_affiliation' => (string) ($detail->institutional_affiliation ?? ''),
            ];
        }

        $common += ['designation' => (string) $user->designation, 'address' => (string) $user->address, 'privacy' => (bool) $user->privacy_accepted_at];

        if ($type === 'group') {
            $artForms = $ids($detail->art_form_id ?? null);
            $primary = $detail->primary_art_form_id ?? ($artForms[0] ?? null);

            return $common + [
                'group_name'          => (string) ($detail->group_name ?? $user->account_name ?? ''),
                'group_type_id'       => isset($detail->group_type_id) ? (string) $detail->group_type_id : '',
                'other_group_type'    => (string) ($detail->other_group_type ?? ''),
                'establishment_year'  => isset($detail->establishment_year) ? (string) $detail->establishment_year : '',
                'registration_number' => (string) ($detail->registration_number ?? ''),
                'total_members'       => isset($detail->total_members) ? (string) $detail->total_members : '',
                'primary_art_form_id' => $primary ? (string) $primary : '',
                'other_art_form_ids'  => array_values(array_diff($artForms, [(int) $primary])),
                'group_description'   => (string) ($detail->group_description ?? ''),
            ];
        }

        $category = $detail->institution_type ?? $user->organisation_type ?? '';
        $category = self::ORG_CATEGORY_ALIASES[$category] ?? $category;

        return $common + [
            'institution_name'    => (string) ($detail->institution_name ?? $user->account_name ?? ''),
            'category'            => array_key_exists($category, self::ORG_CATEGORIES) ? $category : '',
            'sub_category'        => (string) ($detail->sub_category ?? ''),
            'establishment_year'  => isset($detail->establishment_year) ? (string) $detail->establishment_year : '',
            'registration_number' => (string) ($detail->registration_number ?? ''),
            'website'             => (string) ($detail->website ?? ''),
            'institution_description' => (string) ($detail->institution_description ?? ''),
            'hosts_programmes'    => (string) ($detail->hosts_programmes ?? ''),
            'programme_types'     => $list($detail->programme_types ?? null),
            'art_form_ids'        => $ids($detail->art_form_id ?? null),
            'audience_size'       => (string) ($detail->audience_size ?? ''),
            'venue_availability'  => (string) ($detail->venue_availability ?? ''),
            'venue_types'         => $list($detail->venue_types ?? null),
            'venue_facilities'    => $list($detail->venue_facilities ?? null),
            'venue_locations'     => (string) ($detail->venue_locations ?? ''),
            'major_events'        => (string) ($detail->major_events ?? ''),
            'collaborations'      => (string) ($detail->collaborations ?? ''),
            'authorisation'       => (bool) ($detail->authorisation_declared_at ?? false),
        ];
    }

    private function userData(User $user, string $type, array $v, int $actorId): array
    {
        $name = trim(preg_replace('/\s+/', ' ', (string) $v['full_name']));
        $blank = fn ($x) => $x === '' || $x === null ? null : $x;
        $row = [
            'full_name'   => $name,
            'firstname'   => Str::before($name, ' '),
            'lastname'    => Str::contains($name, ' ') ? Str::after($name, ' ') : null,
            'mobile'      => $v['mobile'],
            'state'       => (int) $v['state_id'] ?: null,
            'district'    => (int) $v['district_id'] ?: null,
            'city'        => $blank($v['city'] ?? null),
            'pincode'     => $blank($v['pincode'] ?? null),
            'country_id'  => $user->country_id ?: self::INDIA,
            'profile_completed' => true,
            'updated_by'  => $actorId,
            'updated_at'  => now(),
        ];

        if ($type === 'individual') {
            $row['dob'] = $blank($v['dob'] ?? null);
            $row['gender'] = ($v['gender'] ?? '') !== '' ? (int) $v['gender'] : null;
        } else {
            $row['designation'] = $v['designation'];
            $row['address'] = $v['address'];
            $row['account_name'] = $type === 'group' ? $v['group_name'] : $v['institution_name'];
            if ($type === 'organisation') {
                $row['organisation_type'] = $v['category'];
            }
            if (! $user->privacy_accepted_at && ! empty($v['privacy'])) {
                $row['privacy_accepted_at'] = now();
                $row['policy_version'] = config('app.policy_version');
            }
        }

        return $row;
    }

    private function detailData(string $type, array $v, array $files): array
    {
        $csv = fn (?array $ids) => $ids ? implode(',', array_map('intval', $ids)) : null;
        $list = fn (?array $items) => $items ? implode(',', $items) : null;
        $blank = fn ($x) => $x === '' || $x === null ? null : $x;
        $declared = now();

        $uploads = [];
        foreach (self::FILE_COLUMNS[$type] as $slot => [$column]) {
            $uploads[$column] = $files[$slot] ?? null;
        }
        if ($type === 'group') {
            $uploads['supporting_document'] = $list($files['supporting_documents'] ?? []);
        } elseif ($type === 'organisation') {
            $uploads['supporting_documents'] = $list($files['supporting_documents'] ?? []);
        }

        if ($type === 'individual') {
            $other = $v['subgenre_id'] === 'other';

            return $uploads + [
                'stage_name'        => $blank($v['stage_name']),
                'art_form_id'       => (int) $v['art_form_id'] ?: null,
                'subgenre_id'       => $other ? null : ((int) $v['subgenre_id'] ?: null),
                'other_subgenre'    => $other ? $blank($v['other_subgenre']) : null,
                'art_tradition'     => $blank($v['art_tradition']),
                'years_of_practice' => $v['years_of_practice'] !== '' ? (int) $v['years_of_practice'] : null,
                'language_id'       => $csv($v['language_ids']),
                'biography'         => $v['biography'],
                'institutional_affiliation' => $blank($v['institutional_affiliation']),
                'consent'           => true,
                'public_profile'    => (bool) $v['public_profile'],
                'declaration_accepted_at' => $declared,
            ];
        }

        if ($type === 'group') {
            $primary = (int) $v['primary_art_form_id'];
            $others = array_values(array_diff($v['other_art_form_ids'], [$primary]));
            $groupType = DB::table('art_group_types')->where('id', (int) $v['group_type_id'])->value('name');

            return $uploads + [
                'group_name'          => $v['group_name'],
                'group_type_id'       => (int) $v['group_type_id'],
                'group_type'          => $groupType,
                'other_group_type'    => $groupType === 'Other' ? $blank($v['other_group_type']) : null,
                'establishment_year'  => $v['establishment_year'] !== '' ? (int) $v['establishment_year'] : null,
                'registration_number' => $blank($v['registration_number']),
                'total_members'       => (int) $v['total_members'],
                'primary_art_form_id' => $primary,
                'art_form_id'         => $csv(array_merge([$primary], $others)), // all art forms, primary first
                'language_id'         => $csv($v['language_ids']),
                'group_description'   => $v['group_description'],
                'public_profile'      => (bool) $v['public_profile'],
                'declaration_accepted_at' => $declared,
            ];
        }

        $hosts = $v['hosts_programmes'];

        return $uploads + [
            'institution_name'        => $v['institution_name'],
            'institution_type'        => $v['category'],
            'sub_category'            => $blank($v['sub_category']),
            'establishment_year'      => $v['establishment_year'] !== '' ? (int) $v['establishment_year'] : null,
            'registration_number'     => $blank($v['registration_number']),
            'website'                 => $blank($v['website']),
            'institution_description' => $v['institution_description'],
            'hosts_programmes'        => $hosts,
            'programme_types'         => $hosts === 'no' ? null : $list($v['programme_types']),
            'art_form_id'             => $csv($v['art_form_ids']),
            'language_id'             => $csv($v['language_ids']),
            'audience_size'           => $blank($v['audience_size']),
            'venue_availability'      => $blank($v['venue_availability']),
            'venue_types'             => $list($v['venue_types']),
            'venue_facilities'        => $list($v['venue_facilities']),
            'venue_locations'         => $blank($v['venue_locations']),
            'major_events'            => $blank($v['major_events']),
            'collaborations'          => $blank($v['collaborations']),
            'public_profile'          => (bool) $v['public_profile'],
            'authorisation_declared_at' => $declared,
            'declaration_accepted_at' => $declared,
        ];
    }

    // =================================================================== form payload

    /** What the My Profile form needs to show a snapshot: values, file URLs, awards (with refs), options. */
    public function formPayload(array $snapshot, callable $url): array
    {
        $type = $snapshot['type'];
        $files = [];
        foreach ($snapshot['files'] as $slot => $value) {
            $files[$slot] = $slot === 'supporting_documents'
                ? array_map(fn ($p) => ['path' => $p, 'name' => basename($p), 'url' => $url($p)], $value)
                : $url($value);
        }

        return [
            'values' => $snapshot['values'],
            'files'  => $files,
            'awards' => array_map(fn ($a, $i) => [
                'ref' => 'a'.$i, 'name' => $a['name'], 'year' => $a['year'], 'description' => $a['description'],
                'certificate_url' => $url($a['certificate_path'] ?? null),
            ], $snapshot['awards'], array_keys($snapshot['awards'])),
            'options' => $this->options($type),
        ];
    }

    public function options(string $type): array
    {
        $artForms = DB::table('art_forms')->where('country_id', self::INDIA)->where('status', 1)
            ->orderBy('name')->get(['id', 'parent_id', 'name']);

        $options = [
            'states'    => DB::table('states')->orderBy('StateName')->get(['id', 'StateName as name']),
            'districts' => DB::table('districts as d')->join('states as s', 's.StateCode', '=', 'd.StateCode')
                ->orderBy('d.DistrictName')->get(['d.id', 's.id as state_id', 'd.DistrictName as name']),
            'languages' => DB::table('art_languages')->where('country_id', self::INDIA)->where('status', 1)->orderBy('name')->get(['id', 'name']),
            'art_forms' => $artForms->where('parent_id', 0)->values(),
            'award_suggestions' => DB::table('art_award_masters')->where('country_id', self::INDIA)->where('status', 1)->orderBy('name')->pluck('name'),
            'limits'    => ['links' => self::MAX_LINKS, 'awards' => self::MAX_AWARDS, 'documents' => self::MAX_DOCUMENTS],
        ];

        return $options + match ($type) {
            'individual' => [
                'sub_art_forms' => $artForms->where('parent_id', '>', 0)->values(),
                'genders'       => collect(self::GENDERS)->map(fn ($label, $value) => ['value' => (string) $value, 'label' => $label])->values(),
            ],
            'group' => [
                'group_types' => DB::table('art_group_types')->where('country_id', self::INDIA)->where('status', 1)->orderBy('name')->get(['id', 'name']),
                'representative_roles' => self::REPRESENTATIVE_ROLES,
            ],
            'organisation' => [
                'categories'          => self::ORG_CATEGORIES,
                'registration_required' => self::ORG_REGISTRATION_REQUIRED,
                'hosts_programmes'    => collect(self::HOSTS_PROGRAMMES)->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values(),
                'programme_types'     => self::PROGRAMME_TYPES,
                'audience_sizes'      => self::AUDIENCE_SIZES,
                'venue_availability'  => self::VENUE_AVAILABILITY,
                'venue_types'         => self::VENUE_TYPES,
                'venue_facilities'    => self::VENUE_FACILITIES,
                'designations'        => self::ORG_DESIGNATIONS,
            ],
        };
    }
}
