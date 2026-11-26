/** roles.role_id values in the Laravel database. */
export const ROLES = {
  SUPER_ADMIN: 1,
  ADMIN: 2,
  MINISTRY: 3,
  DEPARTMENT: 4,
  // Artist / Group registration
  ARTIST: 5,
  ARTIST_GROUP: 6,
  /** Organisation / Institute: an artist-side account (NOT an Engagement Partner). */
  ARTIST_INSTITUTION: 7,
  /** ZCC / Akademi Nodal Officer. */
  NODAL_AGENCY: 8,
  /** Hotels, wedding / event / festival organisers, corporates, cultural institutions, government departments. */
  ENGAGEMENT_PARTNER: 11,
} as const;

type ProtectedRoute = {
  /** Path prefix, e.g. "/ministry" protects /ministry and /ministry/... */
  prefix: string;
  /** Role ids allowed in, or "any" for any signed-in user. */
  roles: readonly number[] | "any";
};

/** Staff roles that use the admin console (Laravel /cp panel). */
export const CONSOLE_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MINISTRY, ROLES.DEPARTMENT, ROLES.NODAL_AGENCY] as const;

/** Artist / Group accounts: Individual Artist, Artist Group, Organisation / Institute. */
export const ARTIST_ROLES = [ROLES.ARTIST, ROLES.ARTIST_GROUP, ROLES.ARTIST_INSTITUTION] as const;

/** Engagement Partner accounts (their own console; never the artist one). */
export const PARTNER_ROLES = [ROLES.ENGAGEMENT_PARTNER] as const;

/**
 * Every route that needs a login. Add a row when you add a dashboard.
 * Checked by proxy.ts (before the page renders) and by AuthProvider; the
 * Laravel API checks the role and module permission again on every call.
 */
export const PROTECTED_ROUTES: readonly ProtectedRoute[] = [
  { prefix: "/admin", roles: CONSOLE_ROLES },
  { prefix: "/artist", roles: ARTIST_ROLES },
  { prefix: "/partner", roles: PARTNER_ROLES },
  // Ministry of Culture design console (static mock-up screens).
  { prefix: "/ministry", roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MINISTRY, ROLES.DEPARTMENT] },
];

/** Where each role lands after login. Roles without a dashboard yet go to the home page. */
const ROLE_HOME: Partial<Record<number, string>> = {
  ...Object.fromEntries(CONSOLE_ROLES.map((r) => [r, "/admin/dashboard"])),
  ...Object.fromEntries(ARTIST_ROLES.map((r) => [r, "/artist/dashboard"])),
  ...Object.fromEntries(PARTNER_ROLES.map((r) => [r, "/partner/dashboard"])),
};

export type ConsoleBase = "/admin" | "/artist" | "/partner";

/**
 * URL prefix of the console a role uses. Sidebar links are the Laravel module
 * page_urls ("/art-forms") under this prefix ("/admin/art-forms").
 */
export function consoleBaseFor(roleId: number | undefined): ConsoleBase | null {
  if (roleId === undefined) return null;
  if ((CONSOLE_ROLES as readonly number[]).includes(roleId)) return "/admin";
  if ((ARTIST_ROLES as readonly number[]).includes(roleId)) return "/artist";
  if ((PARTNER_ROLES as readonly number[]).includes(roleId)) return "/partner";
  return null;
}

export function findProtectedRoute(pathname: string): ProtectedRoute | undefined {
  return PROTECTED_ROUTES.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
}

export function isProtectedPath(pathname: string): boolean {
  return findProtectedRoute(pathname) !== undefined;
}

/** Can a user with this role open this path? Public paths are always allowed. */
export function canAccess(pathname: string, roleId: number | undefined): boolean {
  const route = findProtectedRoute(pathname);
  if (!route) return true;
  if (roleId === undefined) return false;
  return route.roles === "any" || route.roles.includes(roleId);
}

export function homePathFor(roleId: number | undefined): string {
  return (roleId !== undefined && ROLE_HOME[roleId]) || "/";
}

/**
 * Validate a ?next= redirect target: must be a same-site relative path the
 * role can open. Anything else falls back to the role's home page.
 */
export function safeRedirectPath(next: string | null | undefined, roleId: number | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    const pathname = next.split(/[?#]/)[0];
    if (canAccess(pathname, roleId) && pathname !== "/login" && pathname !== "/register") return next;
  }
  return homePathFor(roleId);
}
