<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Console user accounts (User Management). Super Admin (1) and the artist
 * roles (5, 6, 7) are never listed or assignable here, same as the Blade
 * Backend\UserController.
 */
class UserController extends Controller
{
    use ApiResponse;

    private const HIDDEN_ROLES = [1, 5, 6, 7];

    /** Default password for accounts created here (same as the Blade panel). */
    private const DEFAULT_PASSWORD = 'Brics@26$P!';

    public function index(Request $request): JsonResponse
    {
        $roleId = $request->integer('role_id') ?: null;

        $users = User::query()
            ->leftJoin('countries', 'countries.id', '=', 'users.country_id')
            ->whereNotIn('users.role_id', self::HIDDEN_ROLES)
            ->when($roleId, fn ($q) => $q->where('users.role_id', $roleId))
            ->select('users.*', 'countries.name as country_name')
            ->with('role')
            ->orderByDesc('users.id')
            ->get()
            ->map(fn (User $u) => [
                'id'           => $u->id,
                'regno'        => $u->regno,
                'full_name'    => $u->full_name,
                'email'        => $u->email,
                'mobile'       => $u->mobile,
                'role_id'      => (int) $u->role_id,
                'role_name'    => $u->role?->name,
                'country_name' => $u->getAttribute('country_name'),
                'designation'  => $u->designation,
                'status'       => (int) $u->active,
                'last_login_at'=> optional($u->last_login_at)->toIso8601String(),
            ]);

        return $this->success(['items' => $users, 'roles' => $this->roles(), 'selected_role' => $roleId]);
    }

    public function show(int $id): JsonResponse
    {
        $u = User::whereNotIn('role_id', self::HIDDEN_ROLES)->findOrFail($id);

        return $this->success(['item' => [
            'id'          => $u->id,
            'firstname'   => $u->firstname,
            'lastname'    => $u->lastname,
            'email'       => $u->email,
            'mobile'      => $u->mobile,
            'gender'      => $u->gender !== null ? (string) $u->gender : '',
            'role'        => (string) $u->role_id,
            'country_id'  => $u->country_id,
            'region_id'   => $u->region_id,
            'city'        => $u->city,
            'designation' => $u->designation,
            'address'     => $u->address,
            'pincode'     => $u->pincode,
            'status'      => (string) (int) $u->active,
            'regno'       => $u->regno,
        ]]);
    }

    public function options(): JsonResponse
    {
        return $this->success([
            'roles'     => $this->roles(),
            'countries' => DB::table('countries')->where('status', 1)->orderBy('name')->get(['id', 'name']),
            'gender'    => genderOptions(),
            'status'    => statusoptions(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, null);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->save($request, User::whereNotIn('role_id', self::HIDDEN_ROLES)->findOrFail($id));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'boolean']]);
        abort_if($id === Auth::id(), 422, 'You cannot change the status of your own account.');

        $user = User::whereNotIn('role_id', self::HIDDEN_ROLES)->findOrFail($id);
        $user->active = (int) $data['status'];
        $user->save();

        return $this->success(['status' => (int) $user->active],
            $user->active ? 'User activated successfully.' : 'User deactivated successfully.');
    }

    private function save(Request $request, ?User $user): JsonResponse
    {
        $assignable = Role::where('active', 1)->whereNotIn('role_id', self::HIDDEN_ROLES)->pluck('role_id')->all();

        $data = $request->validate([
            'firstname'   => ['required', 'string', 'max:100', 'regex:/^[a-zA-Z\s]+$/'],
            'lastname'    => ['required', 'string', 'max:100', 'regex:/^[a-zA-Z\s]+$/'],
            'email'       => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user?->id)],
            'mobile'      => ['required', 'digits:10'],
            'gender'      => ['required', Rule::in(array_keys(genderOptions()))],
            'role'        => ['required', Rule::in($assignable)],
            'country_id'  => ['required', 'integer', Rule::exists('countries', 'id')->where('status', 1)],
            'region_id'   => ['nullable', 'integer', Rule::exists('art_regions', 'id')
                ->where('country_id', $request->input('country_id'))->where('status', 1)],
            'city'        => ['required', 'string', 'max:255'],
            'designation' => ['nullable', 'string', 'max:255'],
            'address'     => ['nullable', 'string', 'max:255'],
            'pincode'     => ['nullable', 'string', 'max:55'],
            'status'      => ['required', Rule::in(array_keys(statusoptions()))],
        ], [
            'firstname.required' => 'Enter First Name',
            'firstname.regex'    => 'First Name must contain letters and spaces only',
            'lastname.required'  => 'Enter Last Name',
            'lastname.regex'     => 'Last Name must contain letters and spaces only',
            'email.required'     => 'Enter Email',
            'email.unique'       => 'This Email is already registered',
            'mobile.required'    => 'Enter Mobile Number',
            'mobile.digits'      => 'Mobile number must be exactly 10 digits',
            'gender.required'    => 'Please select Gender',
            'role.required'      => 'Please choose Role',
            'role.in'            => 'Invalid Role selected',
            'country_id.required'=> 'Please select Country',
            'country_id.exists'  => 'Please select a valid active country.',
            'region_id.exists'   => 'Please select a valid region for the selected country',
            'city.required'      => 'Please enter City / Town',
            'status.required'    => 'Please choose Status',
        ]);

        $country = DB::table('countries')->where('id', $data['country_id'])->first();
        abort_if(!$user && empty($country->alpha_3), 422, 'The selected country is missing its Alpha-3 code.');

        $first = trim($data['firstname']);
        $last = trim($data['lastname']);
        $values = [
            'role_id'     => $data['role'],
            'country_id'  => $data['country_id'],
            'region_id'   => $data['region_id'] ?? null,
            'firstname'   => $first,
            'lastname'    => $last,
            'full_name'   => trim("$first $last"),
            'email'       => trim($data['email']),
            'mobile'      => $data['mobile'],
            'gender'      => $data['gender'],
            'city'        => trim($data['city']),
            'designation' => $data['designation'] ?? null,
            'address'     => $data['address'] ?? null,
            'pincode'     => $data['pincode'] ?? null,
            'active'      => (int) $data['status'],
        ];

        if ($user) {
            $user->forceFill($values + ['updated_by' => Auth::id()])->save();

            return $this->success(['id' => $user->id], 'User updated successfully!');
        }

        $user = DB::transaction(function () use ($values, $country) {
            // Next sequence across every regno format (REG..-000007, IND-N-00001, IND-I-00016...).
            $last = DB::table('users')->whereNotNull('regno')->lockForUpdate()->pluck('regno')
                ->map(fn ($r) => preg_match('/-(\d+)$/', trim((string) $r), $m) ? (int) $m[1] : 0)
                ->max() ?? 0;

            $user = new User();
            $user->forceFill($values + [
                'regno'           => strtoupper(trim($country->alpha_3)) . '-N-' . str_pad((string) ($last + 1), 5, '0', STR_PAD_LEFT),
                'password'        => bcrypt(self::DEFAULT_PASSWORD),
                'created_by'      => Auth::id(),
            ])->save();

            return $user;
        });

        return $this->success(['id' => $user->id], 'User created successfully!', 201);
    }

    private function roles()
    {
        return Role::where('active', 1)->whereNotIn('role_id', self::HIDDEN_ROLES)
            ->orderBy('role_id')->get(['role_id as id', 'name']);
    }
}
