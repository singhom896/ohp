<?php

namespace App\Http\Controllers\Api\V1\Artist;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\BookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Digital Registration Card (module /registration-card) for Artist / Group
 * accounts: registration ID, name, type, art forms, location, status and a
 * verification link to the public profile.
 *
 *   GET /artist/registration-card
 */
class RegistrationCardController extends Controller
{
    use ApiResponse;

    private const STATUS = [0 => 'Under Review', 1 => 'Registered & Verified', 2 => 'Not Approved', 3 => 'Changes Requested'];

    public function __construct(private readonly BookingService $bookings) {}

    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user && in_array((int) $user->role_id, OpportunityController::ROLES, true), 403, 'The registration card is available to Artist / Group accounts only.');
        $a = $this->bookings->artistInfo([$user->id])[$user->id];
        $status = (int) $user->verified_status;
        $approvedAt = DB::table('artist_status_histories')->where('user_id', $user->id)->where('new_status', 1)->latest('id')->value('created_at');

        return $this->success([
            'regno' => $user->regno,
            'name' => $a['name'],
            'holder' => $user->full_name,
            'type' => $a['type'],
            'art_forms' => $a['art_forms'],
            'location' => $a['location'],
            'photo' => $a['photo'],
            'status' => $status,
            'status_label' => self::STATUS[$status] ?? 'Under Review',
            'valid' => $status === 1 && (int) $user->active === 1,
            'issued_on' => substr((string) ($approvedAt ?: $user->created_at), 0, 10),
            'member_since' => substr((string) $user->created_at, 0, 10),
            'verify_url' => $status === 1 ? $this->bookings->frontendUrl('/artist-list/view?id='.$user->id) : null,
        ]);
    }
}
