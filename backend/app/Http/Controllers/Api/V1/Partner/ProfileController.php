<?php

namespace App\Http\Controllers\Api\V1\Partner;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Api\Concerns\ConsoleScope;
use App\Http\Controllers\Controller;
use App\Models\EngagementPartnerProfile as Profile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Engagement Partner "Organisation Profile" (module /partner-profile).
 *
 *   GET  /partner/profile    profile, completion, options
 *   POST /partner/profile    multipart; save progress (action=draft) or save (action=save).
 *                            "save" requires every required field; "draft" only checks what is filled.
 */
class ProfileController extends Controller
{
    use ApiResponse, ConsoleScope, PartnerScope;

    public function show(Request $request): JsonResponse
    {
        $partner = $this->partner($request);

        return $this->success($this->payload($this->profile($partner)) + [
            'options' => [
                'partner_types' => Profile::TYPES,
                'states'        => DB::table('states')->orderBy('StateName')->get(['id', 'StateName as name']),
                'districts'     => DB::table('districts as d')->join('states as s', 's.StateCode', '=', 'd.StateCode')
                    ->orderBy('d.DistrictName')->get(['d.id', 's.id as state_id', 'd.DistrictName as name']),
            ],
            'account' => ['regno' => $partner->regno, 'email' => $partner->email, 'mobile' => $partner->mobile],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $partner = $this->partner($request);
        $profile = $this->profile($partner);
        $final = $request->input('action', 'save') === 'save';
        $req = fn (array $rules) => array_merge([$final ? 'required' : 'nullable'], $rules);
        $stateCode = DB::table('states')->where('id', $request->integer('state_id'))->value('StateCode');

        $data = $request->validate([
            'organisation_name' => ['required', 'string', 'max:200', "regex:/^[\pL\pM\pN\s&.,'()\/-]+$/u"],
            'partner_type'      => ['required', Rule::in(Profile::TYPES)],
            'contact_person'    => ['required', 'string', 'max:150', "regex:/^[\pL\pM\s.'-]+$/u"],
            'designation'       => ['nullable', 'string', 'max:100'],
            'description'       => $req(['string', 'max:3000']),
            'address'           => $req(['string', 'max:500']),
            'state_id'          => $req(['integer', Rule::exists('states', 'id')]),
            'district_id'       => $req(['integer', Rule::exists('districts', 'id')->where('StateCode', $stateCode ?? -1)]),
            'city'              => $req(['string', 'max:100']),
            'pincode'           => $req(['regex:/^[1-9][0-9]{5}$/']),
            'official_email'    => $req(['email:rfc', 'max:191']),
            'contact_number'    => $req(['regex:/^[6-9][0-9]{9}$/']),
            'website'           => ['nullable', 'url:http,https', 'max:255'],
            'logo'              => ['nullable', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'document'          => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:5120'],
            'document_name'     => ['nullable', 'string', 'max:150'],
            'remove_logo'       => ['nullable', 'boolean'],
            'remove_document'   => ['nullable', 'boolean'],
        ], [
            'pincode.regex'        => 'Enter a valid 6-digit PIN code.',
            'contact_number.regex' => 'Enter a valid 10-digit Indian mobile number.',
            'district_id.exists'   => 'Select a district of the selected State / UT.',
            'organisation_name.regex' => 'Organisation name contains characters that are not allowed.',
            'contact_person.regex' => 'Contact person name can only contain letters, spaces, dots, hyphens and apostrophes.',
        ], [
            'state_id' => 'State / UT', 'district_id' => 'district', 'pincode' => 'PIN code', 'official_email' => 'official email',
            'contact_number' => 'contact number', 'description' => 'organisation description', 'address' => 'registered address',
        ]);

        $old = [];
        DB::transaction(function () use ($request, $profile, $partner, $data, &$old) {
            $values = collect($data)->except(['logo', 'document', 'remove_logo', 'remove_document'])
                ->map(fn ($v) => is_string($v) ? (trim(preg_replace('/\s+/', ' ', $v)) ?: null) : $v)->all();
            $values['description'] = isset($data['description']) ? trim($data['description']) : null;

            if ($request->hasFile('logo') || $request->boolean('remove_logo')) {
                $old[] = $profile->logo_path;
                $values['logo_path'] = $request->hasFile('logo') ? $request->file('logo')->store('partners', 'public_uploads') : null;
            }
            if ($request->hasFile('document') || $request->boolean('remove_document')) {
                $old[] = $profile->document_path;
                $values['document_path'] = $request->hasFile('document') ? $request->file('document')->store('partners', 'public_uploads') : null;
            }
            $profile->fill($values);
            $profile->completed_at = $profile->isComplete() ? ($profile->completed_at ?? now()) : null;
            $profile->save();

            // Keep the account record in step (name, type, location used across the portal).
            $partner->forceFill([
                'account_name' => $profile->organisation_name, 'organisation_type' => $profile->partner_type,
                'full_name' => $profile->contact_person, 'designation' => $profile->designation,
                'state' => $profile->state_id, 'district' => $profile->district_id, 'city' => $profile->city,
                'pincode' => $profile->pincode, 'address' => $profile->address,
                'profile_completed' => $profile->completed_at ? 1 : 0,
            ])->save();
        });
        DB::afterCommit(fn () => collect($old)->filter()->each(fn ($p) => Storage::disk('public_uploads')->delete($p)));

        $profile->refresh();

        return $this->success($this->payload($profile), $profile->completed_at
            ? 'Organisation profile saved.'
            : 'Progress saved. Complete the remaining required fields to post opportunities.');
    }

    private function payload(Profile $p): array
    {
        return [
            'profile' => [
                'organisation_name' => $p->organisation_name, 'partner_type' => $p->partner_type, 'contact_person' => $p->contact_person,
                'designation' => $p->designation, 'description' => $p->description, 'address' => $p->address,
                'state_id' => $p->state_id ? (string) $p->state_id : '', 'district_id' => $p->district_id ? (string) $p->district_id : '',
                'city' => $p->city, 'pincode' => $p->pincode, 'official_email' => $p->official_email, 'contact_number' => $p->contact_number,
                'website' => $p->website, 'logo' => $this->uploadUrl($p->logo_path), 'document' => $this->uploadUrl($p->document_path),
                'document_name' => $p->document_name,
            ],
            'completion' => $p->completion(),
            'complete' => $p->completed_at !== null,
            'verified' => $p->verified_at !== null,
            'missing' => collect(Profile::REQUIRED)->reject(fn ($f) => filled($p->{$f}))->values(),
        ];
    }
}
