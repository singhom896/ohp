<?php namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Testimonial extends Model
{
    use HasFactory;

    protected $table = 'testimonials';

    protected $fillable = ['assets_id','name','age','address','testimonial','sortorder','active','created_by','updated_by'];

    protected $casts = ['age'=>'integer','sortorder'=>'integer','active'=>'boolean'];

    public function asset() { return $this->belongsTo(Asset::class,'assets_id','id'); }

    public function creator() { return $this->belongsTo(User::class,'created_by','id'); }

    public function updater() { return $this->belongsTo(User::class,'updated_by','id'); }
}
