<?php

namespace App\Http\Controllers\Api\V1\Artist;

use App\Http\Controllers\Api\Concerns\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\BookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Artist Group (role 6) "Artist Members" (module /group-members). Only
 * registered Individual Artists can be added, found by their Registration ID.
 *
 *   GET    /artist/group-members                  members + roles
 *   GET    /artist/group-members/lookup?regno=    find a registered artist to add
 *   POST   /artist/group-members                  { regno, member_role }
 *   DELETE /artist/group-members/{artistId}
 */
class GroupMemberController extends Controller
{
    use ApiResponse;

    public const MEMBER_ROLES = ['Lead Artist', 'Performer', 'Musician', 'Vocalist', 'Dancer', 'Instrumentalist', 'Technician', 'Artist Member'];

    public function __construct(private readonly BookingService $bookings) {}

    public function index(Request $request): JsonResponse
    {
        $group = $this->group($request);
        $rows = DB::table('artist_group_members')->where('group_id', $group->id)->orderBy('id')->get();
        $info = $this->bookings->artistInfo($rows->pluck('artist_id')->all());

        return $this->success([
            'group' => DB::table('artist_group_details')->where('user_id', $group->id)->value('group_name') ?: ($group->account_name ?: $group->full_name),
            'items' => $rows->map(fn ($m) => $this->member($info[$m->artist_id] ?? null) + ['member_role' => $m->member_role, 'added_at' => $m->created_at])
                ->filter(fn ($m) => isset($m['id']))->values(),
            'roles' => self::MEMBER_ROLES,
        ]);
    }

    public function lookup(Request $request): JsonResponse
    {
        $this->group($request);
        $data = $request->validate(['regno' => ['required', 'string', 'max:50']]);
        $artist = $this->findArtist($data['regno']);

        return $this->success(['artist' => $this->member($this->bookings->artistInfo([$artist->id])[$artist->id] ?? null)]);
    }

    public function store(Request $request): JsonResponse
    {
        $group = $this->group($request);
        $data = $request->validate([
            'regno' => ['required', 'string', 'max:50'],
            'member_role' => ['required', Rule::in(self::MEMBER_ROLES)],
        ], [], ['regno' => 'Artist Registration ID']);
        $artist = $this->findArtist($data['regno']);
        if (DB::table('artist_group_members')->where('group_id', $group->id)->where('artist_id', $artist->id)->exists()) {
            return $this->error('This artist is already a member of your group.', 422, 'validation_error', ['regno' => ['This artist is already a member of your group.']]);
        }
        DB::table('artist_group_members')->insert([
            'group_id' => $group->id, 'artist_id' => $artist->id, 'member_role' => $data['member_role'],
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $this->success(null, 'Artist added to your group.', 201);
    }

    public function destroy(Request $request, int $artistId): JsonResponse
    {
        $group = $this->group($request);
        DB::table('artist_group_members')->where('group_id', $group->id)->where('artist_id', $artistId)->delete();

        return $this->success(null, 'Member removed from your group.');
    }

    private function group(Request $request): User
    {
        $user = $request->user();
        abort_unless($user && (int) $user->role_id === 6, 403, 'Artist Members are available to Artist Group accounts only.');

        return $user;
    }

    /** Registered (approved) Individual Artist with this Registration ID. */
    private function findArtist(string $regno): User
    {
        $artist = User::query()->where('role_id', 5)->where('active', 1)->where('verified_status', 1)
            ->whereRaw('UPPER(regno) = ?', [mb_strtoupper(trim($regno))])->first();
        abort_unless($artist, 404, 'No registered individual artist was found with this Registration ID. Only registered artists can be added to the group.');

        return $artist;
    }

    private function member(?array $a): array
    {
        return $a ? collect($a)->only(['id', 'name', 'regno', 'location', 'art_forms', 'photo'])->all() : [];
    }
}
