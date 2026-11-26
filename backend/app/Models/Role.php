<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;


class Role extends Model
{
	use SoftDeletes;
    protected $fillable = ['role_id','name', 'active'];

    public function users()
    {
        return $this->hasMany(User::class, 'role_id', 'role_id');
    }
    public function modules()
    {
        return $this->belongsToMany(Module::class, 'permissions', 'role_id', 'module_id','id','module_id' )
            ->withPivot(['can_view','can_create','can_edit','can_delete'])
            ->where('active', 1);
    }
	
	public function permissions()
	{
		return $this->hasMany(Permission::class, 'role_id', 'id');
	}

}
