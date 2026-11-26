<?php

namespace App\Services;

use App\Models\ArtistRegistration;
use App\Models\User;
use App\Mail\SetArtistPasswordMail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use RuntimeException;
use Throwable;

/**
 * Creates new artist registrations for the bulk import, mirroring the rules and
 * persistence of ArtistRegistrationBackendController::saveUpdate() (create path).
 */
class ArtistRegistrationService
{
    public function __construct(private readonly EmailService $emailService)
    {
    }

    public const TYPES = [
        'individual' => 5,
        'group' => 6,
        'institutional' => 7,
    ];

    public const TYPE_LABELS = [
        'individual' => 'Individual Artist',
        'group' => 'Artist Group',
        'institutional' => 'Cultural Institution',
    ];

    public const MAX_AWARDS = 3;

    private array $columnCache = [];

    /** Spreadsheet columns per type: key => [heading, required, hint]. */
    public function columns(string $type): array
    {
        $common = [
            'email' => ['Email', true, 'Unique login email, e.g. name@example.com'],
            'phone' => ['Phone', false, 'Text, up to 55 characters'],
            'region_id' => ['Region ID', true, 'ID from the "Regions" sheet'],
            'district_city' => ['District City', true, 'Text, up to 255 characters'],
            'mailing_address' => ['Mailing Address', $type !== 'individual', 'Text, up to 255 characters'],
            'postal' => ['Postal Code', false, 'Text, up to 30 characters'],
            'language_ids' => ['Language IDs', false, 'IDs from the "Languages" sheet, separated by commas, e.g. 1,4'],
            'portfolio_links' => ['Portfolio Links', false, 'Up to 10 full URLs (https://...), separated by semicolons'],
        ];

        $specific = match ($type) {
            'individual' => [
                'full_name' => ['Full Name', true, 'Text, up to 255 characters'],
                'date_of_birth' => ['Date of Birth', true, 'YYYY-MM-DD (e.g. 1990-05-21); must be 18 years or older'],
                'gender' => ['Gender', false, 'Male, Female or Other (or 1, 2, 3)'],
                'art_form_id' => ['Art Form ID', true, 'Top-level ID from the "Art Forms" sheet'],
                'subgenre_id' => ['Subgenre ID', false, 'Child ID of the selected art form'],
                'custom_art_form' => ['Other Art Form Description', false, 'Required when the art form is "Other"'],
                'custom_subgenre' => ['Other Subgenre Description', false, 'Required when the subgenre is "Other"'],
                'years_of_practice' => ['Years of Practice', false, 'Whole number 0-100'],
                'teacher_guru' => ['Teacher Guru', false, 'Text, up to 255 characters'],
                'biography' => ['Biography', false, 'Up to 2000 characters'],
                'institutional_affiliation' => ['Institutional Affiliation', false, 'Text, up to 255 characters'],
                'public_profile' => ['Public Profile', false, 'Yes or No (default No)'],
            ],
            'group' => [
                'full_name' => ['Group Name', true, 'Text, up to 100 characters'],
                'representative_name' => ['Representative Name', true, 'Text, up to 255 characters'],
                'representative_designation' => ['Representative Designation', true, 'Text, up to 255 characters'],
                'group_type_id' => ['Group Type ID', true, 'ID from the "Group Types" sheet'],
                'custom_group_type' => ['Other Group Type Description', false, 'Required when the group type is "Other"'],
                'establishment_year' => ['Establishment Year', false, 'YYYY, 1800 to current year'],
                'registration_number' => ['Registration Number', false, 'Existing legal registration number, up to 255 characters'],
                'total_members' => ['Total Members', true, 'Whole number 1-65535'],
                'art_forms' => ['Art Form IDs', true, 'Top-level IDs from the "Art Forms" sheet, comma separated (max 25)'],
                'custom_art_form' => ['Other Art Form Description', false, 'Required when an art form is "Other"'],
                'biography' => ['Group Description', true, 'Up to 5000 characters'],
            ],
            default => [
                'full_name' => ['Institution Name', true, 'Text, up to 100 characters'],
                'representative_name' => ['Representative Name', true, 'Text, up to 255 characters'],
                'representative_designation' => ['Representative Designation', true, 'Text, up to 255 characters'],
                'institution_type_id' => ['Institution Type ID', true, 'ID from the "Institution Types" sheet'],
                'custom_institution_type' => ['Other Institution Type Description', false, 'Required when the institution type is "Other"'],
                'establishment_year' => ['Establishment Year', false, 'YYYY, 1800 to current year'],
                'institution_registration_type' => ['Institution Registration Type', false, 'Text, up to 100 characters'],
                'registration_number' => ['Registration Number', false, 'Up to 255 characters'],
                'art_forms' => ['Art Form IDs', true, 'Top-level IDs from the "Art Forms" sheet, comma separated (max 25)'],
                'custom_art_form' => ['Other Art Form Description', false, 'Required when an art form is "Other"'],
                'website' => ['Website', false, 'Full URL (https://...)'],
                'biography' => ['Institution Description', true, 'Up to 5000 characters'],
                'cultural_activities' => ['Cultural Activities', false, 'Up to 5000 characters'],
                'training_research_activities' => ['Training Research Activities', false, 'Up to 5000 characters'],
                'associated_artists' => ['Associated Artists', false, 'Whole number 0-100000'],
                'major_events' => ['Major Events', false, 'Up to 5000 characters'],
                'collaborations' => ['Collaborations', false, 'Up to 5000 characters'],
            ],
        };

        $columns = $specific + $common;
        for ($i = 1; $i <= self::MAX_AWARDS; $i++) {
            $columns["award_{$i}_id"] = ["Award {$i} ID", false, 'ID from the "Awards" sheet'];
            $columns["award_{$i}_year"] = ["Award {$i} Year", false, 'YYYY, 1800 to current year'];
            $columns["award_{$i}_description"] = ["Award {$i} Description", false, 'Up to 2000 characters'];
        }

        return $columns;
    }

    /** Map of normalized spreadsheet heading => internal key. */
    public function headingMap(string $type): array
    {
        $map = [];
        foreach ($this->columns($type) as $key => [$heading]) {
            $map[Str::slug($heading, '_')] = $key;
        }

        return $map;
    }

    /** Convert a raw spreadsheet row (heading-slug => value) into validator input. */
    public function normalize(string $type, array $raw): array
    {
        $columns = $this->columns($type);
        $data = [];
        $errors = [];
        foreach ($this->headingMap($type) as $slug => $key) {
            $value = $raw[$slug] ?? null;
            if (is_float($value) && floor($value) === $value && abs($value) < 1e15) {
                $value = (int) $value;
            }
            if (is_bool($value)) {
                $value = $value ? '1' : '0';
            }
            $value = is_scalar($value) ? trim((string) $value) : null;
            if ($value === '') {
                $value = null;
            }
            if ($value !== null && preg_match('/^[=@]/', $value)) {
                $errors[] = $columns[$key][0].' must not start with "=" or "@".';
                $value = null;
            }
            $data[$key] = $value;
        }

        $data['email'] = isset($data['email']) ? strtolower($data['email']) : null;

        if ($type === 'individual') {
            if ($data['gender'] !== null) {
                $data['gender'] = match (strtolower($data['gender'])) {
                    'male', 'm', '1' => '1',
                    'female', 'f', '2' => '2',
                    'other', 'o', '3' => '3',
                    default => $data['gender'],
                };
            }
            $profile = $data['public_profile'] !== null ? strtolower($data['public_profile']) : null;
            $data['public_profile'] = match ($profile) {
                null => '0',
                'yes', 'y', 'true', '1' => '1',
                'no', 'n', 'false', '0' => '0',
                default => $profile,
            };
            if ($data['date_of_birth'] !== null) {
                $dob = $this->normalizeDate($data['date_of_birth']);
                if ($dob === null) {
                    $errors[] = 'Date of Birth must use the format YYYY-MM-DD.';
                    $data['date_of_birth'] = null;
                } else {
                    $data['date_of_birth'] = $dob;
                }
            }
        }

        foreach (['language_ids', 'art_forms'] as $listKey) {
            if (array_key_exists($listKey, $data)) {
                $data[$listKey] = $data[$listKey] === null
                    ? []
                    : array_values(array_filter(preg_split('/[\s,;]+/', $data[$listKey]), fn ($v) => $v !== ''));
            }
        }
        $data['portfolio_links'] = $data['portfolio_links'] === null
            ? []
            : array_values(array_filter(preg_split('/[;\s]+/', $data['portfolio_links']), fn ($v) => $v !== ''));

        $awards = [];
        for ($i = 1; $i <= self::MAX_AWARDS; $i++) {
            $award = [
                'award_id' => $data["award_{$i}_id"] ?? null,
                'award_year' => $data["award_{$i}_year"] ?? null,
                'description' => $data["award_{$i}_description"] ?? null,
            ];
            unset($data["award_{$i}_id"], $data["award_{$i}_year"], $data["award_{$i}_description"]);
            if (array_filter($award, fn ($v) => $v !== null)) {
                $awards[] = $award;
            }
        }
        $data['awards'] = $awards;

        return [$data, $errors];
    }

    private function normalizeDate(string $value): ?string
    {
        if (preg_match('/^\d{5}$/', $value)) { // Excel serial date
            try {
                return \PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject((float) $value)->format('Y-m-d');
            } catch (Throwable) {
                return null;
            }
        }
        if (! preg_match('/^(\d{4})-(\d{2})-(\d{2})(?: 00:00:00)?$/', $value, $m) || ! checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            return null;
        }

        return "{$m[1]}-{$m[2]}-{$m[3]}";
    }

    /** Validate normalized data with the same rules as manual registration. Returns a list of messages. */
    public function validate(string $type, array $data, int $countryId): array
    {
        $validator = Validator::make(
            $data,
            $this->rules($type, $countryId, $data['art_form_id'] ?? null),
            [],
            $this->attributeNames($type)
        );
        $validator->after(function ($validator) use ($type, $data): void {
            if ($validator->errors()->isEmpty()) {
                $this->validateOtherSelections($validator, $type, $data);
            }
        });

        return $validator->fails() ? $validator->errors()->all() : [];
    }

    public function emailExists(string $email): bool
    {
        return DB::table('users')->where('email', strtolower(trim($email)))->exists();
    }

    private function attributeNames(string $type): array
    {
        $names = [];
        foreach ($this->columns($type) as $key => [$heading]) {
            $names[$key] = $heading;
        }
        $names['art_forms.*'] = 'Art Form IDs';
        $names['language_ids.*'] = 'Language IDs';
        $names['portfolio_links.*'] = 'Portfolio Links';
        for ($i = 0; $i < self::MAX_AWARDS; $i++) {
            $n = $i + 1;
            $names["awards.{$i}.award_id"] = "Award {$n} ID";
            $names["awards.{$i}.award_year"] = "Award {$n} Year";
            $names["awards.{$i}.description"] = "Award {$n} Description";
        }

        return $names;
    }

    private function hasColumn(string $table, string $column): bool
    {
        return $this->columnCache["$table.$column"] ??= Schema::hasColumn($table, $column);
    }

    /** Same country scoping the manual form uses when listing master data. */
    public function scopeMaster(string $table, int $countryId)
    {
        $query = DB::table($table)->where('status', 1);
        if ($this->hasColumn($table, 'country_id')) {
            $query->where('country_id', $countryId);
        }

        return $query;
    }

    private function scopedExists(string $table, int $countryId)
    {
        return Rule::exists($table, 'id')->where(function ($query) use ($table, $countryId) {
            $query->where('status', 1);
            if ($this->hasColumn($table, 'country_id')) {
                $query->where('country_id', $countryId);
            }
        });
    }

    public function rules(string $type, int $countryId, mixed $artFormId = null): array
    {
        $topArtForm = Rule::exists('art_forms', 'id')->where('country_id', $countryId)->where('status', 1)->where('parent_id', 0);

        $rules = [
            'region_id' => ['required', 'integer', Rule::exists('art_regions', 'id')->where('status', 1)->where('country_id', $countryId)],
            'email' => ['required', 'email:rfc', 'max:255', Rule::unique('users', 'email')],
            'phone' => ['nullable', 'string', 'max:55'],
            'mailing_address' => ['nullable', 'string', 'max:255'],
            'postal' => ['nullable', 'string', 'max:30'],
            'language_ids' => ['nullable', 'array', 'max:50'],
            'language_ids.*' => ['integer', 'distinct', $this->scopedExists('art_languages', $countryId)],
            'portfolio_links' => ['nullable', 'array', 'max:10'],
            'portfolio_links.*' => ['url', 'max:2048'],
            'awards' => ['nullable', 'array', 'max:10'],
            'awards.*.award_id' => ['required', 'integer', $this->scopedExists('art_award_masters', $countryId)],
            'awards.*.award_year' => ['nullable', 'integer', 'between:1800,'.now()->year],
            'awards.*.description' => ['nullable', 'string', 'max:2000'],
        ];

        if ($type === 'individual') {
            return $rules + [
                'full_name' => ['required', 'string', 'max:255'],
                'district_city' => ['required', 'string', 'max:255'],
                'date_of_birth' => ['required', 'date', 'before_or_equal:'.now()->subYears(18)->toDateString()],
                'gender' => ['nullable', Rule::in(['1', '2', '3'])],
                'art_form_id' => ['required', 'integer', $topArtForm],
                'subgenre_id' => ['nullable', 'integer', Rule::exists('art_forms', 'id')->where('country_id', $countryId)->where('status', 1)->where('parent_id', (int) $artFormId)],
                'custom_art_form' => ['nullable', 'string', 'max:255'],
                'custom_subgenre' => ['nullable', 'string', 'max:255'],
                'years_of_practice' => ['nullable', 'integer', 'between:0,100'],
                'teacher_guru' => ['nullable', 'string', 'max:255'],
                'biography' => ['nullable', 'string', 'max:2000'],
                'institutional_affiliation' => ['nullable', 'string', 'max:255'],
                'public_profile' => ['nullable', 'boolean'],
            ];
        }

        $rules += [
            'full_name' => ['required', 'string', 'max:100'],
            'representative_name' => ['required', 'string', 'max:255'],
            'representative_designation' => ['required', 'string', 'max:255'],
            'district_city' => ['required', 'string', 'max:255'],
            'establishment_year' => ['nullable', 'integer', 'between:1800,'.now()->year],
            'registration_number' => ['nullable', 'string', 'max:255'],
            'art_forms' => ['required', 'array', 'min:1', 'max:25'],
            'art_forms.*' => ['integer', 'distinct', $topArtForm],
            'custom_art_form' => ['nullable', 'string', 'max:255'],
            'biography' => ['required', 'string', 'max:5000'],
            'mailing_address' => ['required', 'string', 'max:255'],
        ];

        if ($type === 'group') {
            return $rules + [
                'group_type_id' => ['required', 'integer', $this->scopedExists('art_group_types', $countryId)],
                'custom_group_type' => ['nullable', 'string', 'max:255'],
                'total_members' => ['required', 'integer', 'between:1,65535'],
            ];
        }

        return $rules + [
            'institution_type_id' => ['required', 'integer', $this->scopedExists('art_institution_types', $countryId)],
            'custom_institution_type' => ['nullable', 'string', 'max:255'],
            'institution_registration_type' => ['nullable', 'string', 'max:100'],
            'website' => ['nullable', 'url', 'max:2048'],
            'cultural_activities' => ['nullable', 'string', 'max:5000'],
            'training_research_activities' => ['nullable', 'string', 'max:5000'],
            'associated_artists' => ['nullable', 'integer', 'between:0,100000'],
            'major_events' => ['nullable', 'string', 'max:5000'],
            'collaborations' => ['nullable', 'string', 'max:5000'],
        ];
    }

    private function validateOtherSelections($validator, string $type, array $data): void
    {
        $artFormIds = $type === 'individual' ? [$data['art_form_id']] : ($data['art_forms'] ?? []);
        $otherArtForm = DB::table('art_forms')->whereIn('id', $artFormIds)->where('name', 'Other')->exists();
        if ($otherArtForm && blank($data['custom_art_form'] ?? null)) {
            $validator->errors()->add('custom_art_form', 'Please describe the selected Other art form.');
        }

        if ($type === 'individual' && ! empty($data['subgenre_id'])
            && DB::table('art_forms')->where('id', $data['subgenre_id'])->value('name') === 'Other'
            && blank($data['custom_subgenre'] ?? null)) {
            $validator->errors()->add('custom_subgenre', 'Please describe the selected Other subgenre.');
        } elseif ($type === 'group'
            && DB::table('art_group_types')->where('id', $data['group_type_id'])->value('name') === 'Other'
            && blank($data['custom_group_type'] ?? null)) {
            $validator->errors()->add('custom_group_type', 'Please enter the custom group type.');
        } elseif ($type === 'institutional'
            && DB::table('art_institution_types')->where('id', $data['institution_type_id'])->value('name') === 'Other'
            && blank($data['custom_institution_type'] ?? null)) {
            $validator->errors()->add('custom_institution_type', 'Please enter the custom institution type.');
        }
    }

    /**
     * Persist one validated registration atomically, then send the single account setup email.
     * Returns ['user' => User, 'notified' => bool].
     */
    public function register(string $type, array $validated, int $countryId, int $actorId): array
    {
        $activationToken = Str::random(64);
        $this->acquireRegistrationLock();
        try {
            $user = DB::transaction(fn (): User => $this->persist($type, $validated, $countryId, $actorId, $activationToken));
        } finally {
            $this->releaseRegistrationLock();
        }

        $notified = $this->emailService->send(
            $user->email,
            SetArtistPasswordMail::class,
            [$activationToken],
            config('mail_notifications.password_setup', true)
        );

        if (! $notified) {
            Log::warning('Bulk import: account setup email was not sent', ['user_id' => $user->id]);
        }

        return ['user' => $user, 'notified' => $notified];
    }

    private function persist(string $type, array $v, int $countryId, int $actorId, string $activationToken): User
    {
        $country = DB::table('countries')->where('id', $countryId)->first();
        $representativeName = $type === 'individual' ? $v['full_name'] : $v['representative_name'];

        $userId = DB::table('users')->insertGetId([
            'role_id' => self::TYPES[$type],
            'country_id' => $countryId,
            'region_id' => $v['region_id'],
            'city' => $v['district_city'] ?? null,
            'full_name' => $representativeName,
            'firstname' => Str::before($representativeName, ' '),
            'lastname' => Str::after($representativeName, ' ') ?: null,
            'email' => strtolower(trim($v['email'])),
            'mobile' => $v['phone'] ?? null,
            'dob' => $type === 'individual' ? ($v['date_of_birth'] ?? null) : null,
            'gender' => $type === 'individual' ? ($v['gender'] ?? null) : null,
            'designation' => $type === 'individual' ? null : ($v['representative_designation'] ?? null),
            'address' => $v['mailing_address'] ?? null,
            'pincode' => $v['postal'] ?? null,
            'password' => Hash::make(Str::random(64)),
            'active' => 0,
            'verified_status' => 0,
            'created_by' => $actorId,
            'updated_by' => $actorId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $user = User::query()->findOrFail($userId);
        $user->regno = $this->nextRegistrationNumber((string) ($country->alpha_3 ?? 'REG'), $type);
        $user->save();

        $detail = $this->detailData($v, $type);
        $detail['user_id'] = $userId;
        $detail['created_at'] = now();
        if ($type === 'individual') {
            $detail['status'] = ArtistRegistration::STATUS_PENDING;
        } elseif ($type === 'group') {
            $detail['registration_type'] = $type;
        }
        $detailId = DB::table($this->detailTable($type))->insertGetId($detail);

        foreach (array_filter($v['portfolio_links'] ?? []) as $url) {
            DB::table('artist_portfolio_links')->insert([
                'registration_type' => self::TYPES[$type],
                'registration_id' => $detailId,
                'portfolio_link' => trim($url),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        foreach (($v['awards'] ?? []) as $award) {
            if (blank($award['award_id'] ?? null)) {
                continue;
            }
            DB::table('artist_awards')->insert([
                'registration_type' => self::TYPES[$type],
                'registration_id' => $detailId,
                'award_id' => $award['award_id'],
                'award_year' => $award['award_year'] ?? null,
                'description' => $award['description'] ?? null,
                'certificate_path' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        DB::table('artist_account_activations')->updateOrInsert(
            ['user_id' => $userId],
            [
                'token_hash' => hash('sha256', $activationToken),
                'expires_at' => now()->addHours(24),
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        return $user;
    }

    private function detailData(array $v, string $type): array
    {
        $languages = implode(',', array_map('intval', $v['language_ids'] ?? []));
        $artForms = implode(',', array_map('intval', $v['art_forms'] ?? []));

        if ($type === 'individual') {
            return [
                'art_form_id' => $v['art_form_id'],
                'other_art_form' => $v['custom_art_form'] ?? null,
                'subgenre_id' => $v['subgenre_id'] ?? null,
                'other_subgenre' => $v['custom_subgenre'] ?? null,
                'years_of_practice' => $v['years_of_practice'] ?? null,
                'teacher_guru' => $v['teacher_guru'] ?? null,
                'language_id' => $languages ?: null,
                'biography' => $v['biography'] ?? null,
                'institutional_affiliation' => $v['institutional_affiliation'] ?? null,
                'profile_photo' => null,
                'identity_document' => null,
                'public_profile' => (bool) ($v['public_profile'] ?? false),
                'updated_at' => now(),
            ];
        }

        if ($type === 'group') {
            $groupType = DB::table('art_group_types')->where('id', $v['group_type_id'])->first();

            return [
                'group_name' => $v['full_name'],
                'group_type_id' => $v['group_type_id'],
                'group_type' => $groupType->name,
                'other_group_type' => $v['custom_group_type'] ?? null,
                'establishment_year' => $v['establishment_year'] ?? null,
                'registration_number' => $v['registration_number'] ?? null,
                'total_members' => $v['total_members'],
                'art_form_id' => $artForms,
                'other_art_form' => $v['custom_art_form'] ?? null,
                'language_id' => $languages ?: null,
                'group_description' => $v['biography'],
                'identity_document' => null,
                'profile_photo' => null,
                'portfolio_link' => null,
                'supporting_document' => null,
                'updated_at' => now(),
            ];
        }

        $institutionType = DB::table('art_institution_types')->where('id', $v['institution_type_id'])->first();

        return [
            'institution_name' => $v['full_name'],
            'institution_type' => $institutionType->name,
            'other_institution_type' => $v['custom_institution_type'] ?? null,
            'establishment_year' => $v['establishment_year'] ?? null,
            'institution_registration_type' => $v['institution_registration_type'] ?? null,
            'registration_number' => $v['registration_number'] ?? null,
            'art_form_id' => $artForms,
            'other_art_form' => $v['custom_art_form'] ?? null,
            'website' => $v['website'] ?? null,
            'institution_description' => $v['biography'],
            'identity_document' => null,
            'authorization_letter' => null,
            'cultural_activities' => $v['cultural_activities'] ?? null,
            'training_research_activities' => $v['training_research_activities'] ?? null,
            'language_id' => $languages ?: null,
            'associated_artists' => $v['associated_artists'] ?? null,
            'institution_logo' => null,
            'brochure_path' => null,
            'major_events' => $v['major_events'] ?? null,
            'collaborations' => $v['collaborations'] ?? null,
            'registration_certificate' => null,
            'supporting_documents' => null,
            'updated_at' => now(),
        ];
    }

    private function detailTable(string $type): string
    {
        return match ($type) {
            'individual' => 'artist_registrations',
            'group' => 'artist_group_details',
            default => 'artist_institution_details',
        };
    }

    private function nextRegistrationNumber(string $alpha3, string $type): string
    {
        // Global OH-AI / OH-AG / OH-AO sequence (App\Support\RegistrationNumber); $alpha3 is no longer part of the ID.
        return \App\Support\RegistrationNumber::next(\App\Support\RegistrationNumber::roleForType($type));
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
}
