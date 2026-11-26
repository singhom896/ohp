<?php

use App\Models\Banner;
use Illuminate\Support\Facades\Auth;


if (!function_exists('custom_function')) {
  function custom_function($param)
  {
    // Your helper function logic here
    return $param;
  }
}


if (! function_exists('authUserData')) {
    function authUserData(?string $key = null): mixed
    {
        $user = Auth::user();

        if (! $user) {
            return $key === null ? [] : null;
        }

        $data = [
            'id'         => $user->id,
            'name'       => $user->full_name,
            'email'      => $user->email,
            'role_id'    => $user->role_id,
            'country_id' => $user->country_id,
        ];

        // Parameter diya hai to sirf wahi value return hogi
        if ($key !== null) {
            return $data[$key] ?? null;
        }

        // Parameter nahi diya to saari details
        return $data;
    }
}


if (! function_exists('hasCountryAccess')) {
    function hasCountryAccess(): bool
    {
        return in_array(
            (int) authUserData('role_id'),
            [4, 8],
            true
        );
    }
}

?>
