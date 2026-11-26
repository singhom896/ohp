// Profile gate for artist accounts (Individual / Group / Organisation).
// Until the profile is completed, or an update is waiting for review, the
// artist console only opens My Profile and Change Password; every other page
// redirects to My Profile (components/console/ProfilePrompt.tsx).
import type { AuthUser } from "@/lib/api/types";
import { ARTIST_ROLES } from "@/lib/auth/roles";

export const PROFILE_PATH = "/artist/profile";

/** Pages an artist can still open while the profile is incomplete. */
const ALLOWED = [PROFILE_PATH, "/artist/change-password"];

export function isProfileLocked(u: AuthUser | null | undefined): boolean {
  return (
    !!u &&
    (ARTIST_ROLES as readonly number[]).includes(u.role.id) &&
    u.profile_completed === false &&
    !u.profile_pending
  );
}

export function isAllowedWhileLocked(pathname: string): boolean {
  return ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
