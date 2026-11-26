<?php

// Global helpers used by the API (routes/api.php). Loaded via composer.json autoload.files.

if (!function_exists('genderOptions')) {
    function genderOptions()
    {
        return [
            '1' => 'Male',
            '2' => 'Female',
            '3' => 'Others'
        ];
    }
}
if (!function_exists('statusoptions')) {
    function statusoptions()
    {
        return [
            '0' => 'Save and Unpublish',
            '1' => 'Save and Publish',
        ];
    }
}
if (!function_exists('pagetype')) {
    function pagetype()
    {
        return [
            '1' => 'Custom',
            '2' => 'Content',
            '3' => 'Document',
        ];
    }
}
if (!function_exists('targettype')) {
    function targettype()
    {
        return [
            '_self' => '_self',
            '_blank' => '_blank',
        ];
    }
}
if (! function_exists('generateRegistrationNumber')) {
    /**
     * Registration ID for a new account: OH-AI / OH-AG / OH-AO / OH-EP-NNNNN
     * (App\Support\RegistrationNumber) for artist and partner accounts; other
     * roles keep the older "REG..." format.
     */
    function generateRegistrationNumber(int $userId, ?int $roleId = null): string
    {
        $roleId ??= (int) \Illuminate\Support\Facades\DB::table('users')->where('id', $userId)->value('role_id');

        return \App\Support\RegistrationNumber::next($roleId)
            ?? 'REG' . now()->timestamp . '-' . str_pad((string) $userId, 6, '0', STR_PAD_LEFT);
    }
}
