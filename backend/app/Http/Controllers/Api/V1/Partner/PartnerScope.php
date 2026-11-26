<?php

namespace App\Http\Controllers\Api\V1\Partner;

use App\Models\BookingRequirement as Requirement;
use App\Models\EngagementPartnerProfile;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Engagement Partner endpoints: only role 11 accounts, each limited to its own
 * opportunities. The route's api.permission check guards the module; this
 * guards the account type and ownership (no cross-role or cross-partner access).
 */
trait PartnerScope
{
    protected function partner(Request $request): User
    {
        $user = $request->user();
        abort_unless($user && (int) $user->role_id === EngagementPartnerProfile::ROLE, 403, 'This section is available to Engagement Partner accounts only.');

        return $user;
    }

    protected function profile(User $partner): EngagementPartnerProfile
    {
        return EngagementPartnerProfile::query()->firstOrCreate(['user_id' => $partner->id], [
            'organisation_name' => $partner->account_name ?: $partner->full_name,
            'partner_type'      => $partner->organisation_type ?: EngagementPartnerProfile::TYPES[0],
            'contact_person'    => $partner->full_name,
            'official_email'    => $partner->email,
            'contact_number'    => $partner->mobile,
        ]);
    }

    protected function mine(Request $request, int $id): Requirement
    {
        return Requirement::query()->where('organisation_id', $this->partner($request)->id)->findOrFail($id);
    }

    protected static function pageMeta($page): array
    {
        return ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'from' => $page->firstItem(), 'to' => $page->lastItem()];
    }
}
