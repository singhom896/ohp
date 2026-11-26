<?php

namespace App\Http\Controllers\Api\V1\Console;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Role permission matrix. Mirrors Backend\PermissionController.
 *
 *   GET   /permissions?role_id=5
 *   PATCH /permissions   { role_id, module_id?, all_modules?, permission, status }
 *         permission = can_view | can_create | can_edit | can_delete | all
 */
class PermissionController extends Controller
{
    use ApiResponse;

    private const FLAGS = ['can_view', 'can_create', 'can_edit', 'can_delete'];

    public function index(Request $request): JsonResponse
    {
        $roles = Role::where('active', 1)->orderBy('role_id')->get(['id', 'role_id', 'name']);
        $roleId = $request->integer('role_id') ?: null;

        $rows = [];
        if ($roleId) {
            $role = Role::where('role_id', $roleId)->firstOrFail();

            $rows = DB::table('modules as m')
                ->leftJoin('permissions as p', fn ($j) => $j->on('p.module_id', '=', 'm.module_id')->where('p.role_id', '=', $role->id))
                ->leftJoin('modules as parent', 'parent.module_id', '=', 'm.parent_id')
                ->where('m.active', 1)
                ->orderByRaw('COALESCE(parent.position, m.position)')
                ->orderByRaw('CASE WHEN m.parent_id IS NULL THEN 0 ELSE 1 END')
                ->orderBy('m.position')
                ->get([
                    'm.module_id', 'm.module_name', 'm.parent_id', 'parent.module_name as parent_name',
                    'p.id as permission_id', 'p.can_view', 'p.can_create', 'p.can_edit', 'p.can_delete',
                ])
                ->map(function ($r) {
                    foreach (self::FLAGS as $flag) {
                        $r->{$flag} = (int) ($r->{$flag} ?? 0);
                    }
                    return $r;
                });
        }

        return $this->success(['roles' => $roles, 'selected_role' => $roleId, 'items' => $rows]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'role_id'     => ['required', 'integer', 'exists:roles,role_id'],
            'module_id'   => ['nullable', 'required_without:all_modules', 'integer', 'exists:modules,module_id'],
            'all_modules' => ['nullable', 'boolean'],
            'permission'  => ['required', 'in:' . implode(',', [...self::FLAGS, 'all'])],
            'status'      => ['required', 'boolean'],
        ]);

        $role = Role::where('role_id', $data['role_id'])->firstOrFail();
        $status = (int) $data['status'];
        $flags = $data['permission'] === 'all' ? self::FLAGS : [$data['permission']];

        $moduleIds = !empty($data['all_modules'])
            ? Module::where('active', 1)->pluck('module_id')->all()
            : [(int) $data['module_id']];

        DB::transaction(function () use ($moduleIds, $role, $flags, $status) {
            foreach ($moduleIds as $moduleId) {
                $permission = Permission::firstOrCreate(
                    ['role_id' => $role->id, 'module_id' => $moduleId],
                    array_fill_keys(self::FLAGS, 0)
                );
                foreach ($flags as $flag) {
                    $permission->{$flag} = $status;
                }
                $permission->save();
            }
        });

        return $this->success(
            ['status' => $status, 'permission' => $data['permission']],
            count($moduleIds) > 1 ? 'Permission updated for all modules successfully.' : 'Permission updated successfully.'
        );
    }
}
