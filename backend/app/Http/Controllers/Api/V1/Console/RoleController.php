<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Roles (Administration). Mirrors Backend\RoleController. */
class RoleController extends Controller
{
    use ApiResponse;

    public function index(): JsonResponse
    {
        $items = Role::withCount(['users', 'permissions'])->orderBy('role_id')->get()->map(fn (Role $r) => [
            'id'                => $r->id,
            'role_id'           => (int) $r->role_id,
            'name'              => $r->name,
            'status'            => (int) $r->active,
            'users_count'       => $r->users_count,
            'permissions_count' => $r->permissions_count,
        ]);

        return $this->success(['items' => $items]);
    }

    public function show(int $id): JsonResponse
    {
        $r = Role::findOrFail($id);

        return $this->success(['item' => [
            'id' => $r->id, 'roleid' => (int) $r->role_id, 'role' => $r->name, 'status' => (string) (int) $r->active,
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        return $this->save($request, null);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        return $this->save($request, Role::findOrFail($id));
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'boolean']]);
        $role = Role::findOrFail($id);
        abort_if((int) $role->role_id === 1 && !$data['status'], 422, 'The Super Admin role cannot be deactivated.');

        $role->active = (int) $data['status'];
        $role->save();

        return $this->success(['status' => (int) $role->active],
            $role->active ? 'Role activated successfully.' : 'Role deactivated successfully.');
    }

    private function save(Request $request, ?Role $role): JsonResponse
    {
        $data = $request->validate([
            'roleid' => ['required', 'integer', Rule::unique('roles', 'role_id')->ignore($role?->id)],
            'role'   => ['required', 'string', 'regex:/^[a-zA-Z\s]+$/'],
            'status' => ['required', Rule::in(array_keys(statusoptions()))],
        ], [
            'roleid.required' => 'Enter Role ID',
            'roleid.integer'  => 'Role ID must be a number',
            'roleid.unique'   => 'This Role ID is already in use',
            'role.required'   => 'Enter Role Name',
            'role.regex'      => 'Role must contain letters and spaces only',
            'status.required' => 'Please choose Status',
        ]);

        $values = ['role_id' => $data['roleid'], 'name' => $data['role'], 'active' => (int) $data['status']];

        if ($role) {
            $role->update($values);
            return $this->success(['id' => $role->id], 'Role updated successfully!');
        }

        $role = Role::create($values);

        return $this->success(['id' => $role->id], 'Role created successfully!', 201);
    }
}
