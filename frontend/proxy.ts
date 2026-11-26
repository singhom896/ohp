import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/lib/api/client-ip";
import { AUTH_PAGES } from "@/lib/auth/config";
import { decodeJwt, needsRefresh, type JwtClaims } from "@/lib/auth/jwt";
import { canAccess, findProtectedRoute, homePathFor } from "@/lib/auth/roles";
import { clearSessionCookie, readSession, refreshAccessToken, setSessionCookie } from "@/lib/auth/session";

/**
 * Runs before every page request (Next.js 16 "proxy", formerly middleware).
 *
 *  - Protected page, no/expired session      -> /login?next=<page>
 *  - Protected page, wrong role              -> that role's home page
 *  - Token about to expire                   -> refreshed here, cookie updated
 *  - /login or /register while signed in     -> role's home page
 *
 * This is the optimistic first line. The JWT signature is verified by Laravel
 * on every API call, and AuthProvider re-verifies in the browser.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const route = findProtectedRoute(pathname);
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (!route && !isAuthPage) return NextResponse.next();

  const session = readSession(request.cookies);
  let claims: JwtClaims | null = decodeJwt(session.token);
  let refreshedToken: string | undefined;
  let sessionDead = !!session.token && !claims;

  if (session.token && claims && needsRefresh(claims)) {
    const r = await refreshAccessToken(session.token, clientIp(request.headers));
    if (r.ok) {
      refreshedToken = r.token;
      claims = decodeJwt(r.token);
    } else if (r.fatal) {
      claims = null;
      sessionDead = true;
    }
    // Backend unreachable: keep the optimistic claims; AuthProvider will report it.
  }

  const finish = (res: NextResponse) => {
    if (sessionDead) clearSessionCookie(res);
    else if (refreshedToken) setSessionCookie(res, refreshedToken, session.remember);
    return res;
  };

  if (route) {
    if (!claims) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname + search);
      if (session.token) login.searchParams.set("reason", "expired");
      return finish(NextResponse.redirect(login));
    }
    if (!canAccess(pathname, claims.role)) {
      return finish(NextResponse.redirect(new URL(homePathFor(claims.role), request.url)));
    }
  } else if (isAuthPage && claims) {
    return finish(NextResponse.redirect(new URL(homePathFor(claims.role), request.url)));
  }

  const res = NextResponse.next();
  // Logged-in pages must never come from a shared cache.
  if (route) res.headers.set("Cache-Control", "private, no-store");
  return finish(res);
}

export const config = {
  // Pages only: skip API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
