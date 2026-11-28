<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Notifications\Notifiable;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Facades\Hash;
use Tymon\JWTAuth\Contracts\JWTSubject;

class User extends Authenticatable implements JWTSubject
{
    use Notifiable;

    /** Never expose these when a user is serialised to JSON. */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    // ---- JWTSubject -------------------------------------------------------

    public function getJWTIdentifier()
    {
        return $this->getKey();
    }

    /**
     * Extra claims embedded in the token. The frontend proxy reads `role`
     * for optimistic route checks; the API still re-checks on every call.
     */
    public function getJWTCustomClaims(): array
    {
        return [
            'role' => (int) $this->role_id,
        ];
    }

    /**
     * Why this account may not use the system right now, or null if it can.
     * Shared by login, refresh and the JWT middleware so a user who is
     * deactivated after logging in is locked out on their next request.
     */
    public function accountBlockReason(): ?string
    {
        if ((int) $this->active !== 1) {
            return 'Your account is inactive. Please contact the administrator.';
        }

        // Artist accounts (5, 6, 7) sign in while their registration is Pending (0),
        // Rejected (2) or Changes Requested (3): they complete / correct the profile
        // from the dashboard. Approval (1) is what lists them publicly and makes them
        // bookable (checked where that happens), not what lets them log in.
        $artistReviewable = in_array((int) $this->role_id, [5, 6, 7], true)
            && in_array((int) $this->verified_status, [0, 2, 3], true);

        switch ($artistReviewable ? 1 : (int) $this->verified_status) {
            case 1:
                break;
            case 0:
                return 'Your account is pending verification. Please wait for approval.';
            case 2:
                return 'Your account verification has been rejected. Please contact the administrator.';
            default:
                return 'Your account verification status is invalid. Please contact the administrator.';
        }

        $role = $this->relationLoaded('role') ? $this->role : $this->role()->first();
        if (!$role || (int) $role->active !== 1) {
            return 'Your assigned role is inactive. Please contact the administrator.';
        }

        return null;
    }
    protected $casts = [
        'dob' => 'date',
        'last_login_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected $fillable = [
        'role_id',
        'country_id',
        'region_id',
        'city',
        'full_name',
        'regno',
        'state',
        'district',
        'firstname',
        'lastname',
        'email',
        'password',
        'mobile',
        'gender',
        'designation',
        'address',
        'pincode',
        'email_verified_at',
        'mobile_verified_at',
        'active',
        'verified_status',
        'last_login_at',
        'created_by',
        'updated_by',
        'created_at',
        'updated_at',

        'father_name',
        'dob',
        'middlename',
        'category',
    ];

    public function role()
    {
        return $this->belongsTo(Role::class, 'role_id', 'role_id');
    }
    public function getFullNameAttributeold()
    {
        /*  return trim(
            $this->firstname . ' ' .
                ($this->middlename ? $this->middlename . ' ' : '') .
                $this->lastname
        ); */
        
        return trim(
            $this->firstname . ' ' . $this->lastname
        );
    }

   /*  public function verifyPassword(string $candidate): bool
    {
        $storedPassword = (string) $this->password;
        $passwordInfo = password_get_info($storedPassword);

        if (($passwordInfo['algoName'] ?? 'unknown') !== 'unknown') {
            return password_verify($candidate, $storedPassword);
        }

        $matchesLegacyPassword = hash_equals($storedPassword, $candidate)
            || hash_equals($storedPassword, hash('sha256', $candidate));

        if ($matchesLegacyPassword) {
            $this->password = Hash::make($candidate);
            $this->save();
        }

        return $matchesLegacyPassword;
    } */
	
	public function verifyPassword(string $candidate): bool
{
    $storedPassword = (string) $this->password;

    // Laravel / bcrypt password
    if (Hash::check($candidate, $storedPassword)) {
        return true;
    }

    // Legacy SHA-256 password
    $legacyHash = hash('sha256', $candidate);

    if (hash_equals($storedPassword, $legacyHash)) {
        $this->password = Hash::make($candidate);
        $this->save();

        return true;
    }

    // Legacy plain password, if any
    if (hash_equals($storedPassword, $candidate)) {
        $this->password = Hash::make($candidate);
        $this->save();

        return true;
    }

    return false;
}
}
