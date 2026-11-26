// SERVER-ONLY: cookie + token refresh logic shared by route handlers and proxy.ts.
import { NextResponse } from "next/server";
import { backendFetch, type BackendResult } from "@/lib/api/backend";
import type { ApiFailure, TokenData } from "@/lib/api/types";
import { AUTH_COOKIE, REFRESH_WINDOW_SECONDS, REMEMBER_COOKIE } from "./config";
import { decodeJwt, needsRefresh } from "./jwt";

/** Minimal cookie reader so this works with both `cookies()` and `request.cookies`. */
type CookieReader = { get(name: string): { value: string } | undefined };

export type SessionCookies = { token?: string; remember: boolean };

export function readSession(cookies: CookieReader): SessionCookies {
  return {
    token: cookies.get(AUTH_COOKIE)?.value || undefined,
    remember: cookies.get(REMEMBER_COOKIE)?.value === "1",
  };
}

const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Store the JWT. "Remember me" -> persistent cookie for the refresh window; otherwise a browser-session cookie. */
export function setSessionCookie(res: NextResponse, token: string, remember: boolean): void {
  const maxAge = remember ? REFRESH_WINDOW_SECONDS : undefined;
  res.cookies.set(AUTH_COOKIE, token, { ...baseCookie, maxAge });
  if (remember) res.cookies.set(REMEMBER_COOKIE, "1", { ...baseCookie, maxAge });
  else res.cookies.delete(REMEMBER_COOKIE);
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.delete(AUTH_COOKIE);
  res.cookies.delete(REMEMBER_COOKIE);
}

export type RefreshOutcome =
  | { ok: true; token: string; data: TokenData }
  /** `fatal` = the session is definitely over (log out). false = transient (backend down). */
  | { ok: false; fatal: boolean; result: BackendResult };

export async function refreshAccessToken(token: string, clientIp?: string): Promise<RefreshOutcome> {
  const result = await backendFetch<TokenData>("/auth/refresh", { method: "POST", token, clientIp });
  if (result.body.success) return { ok: true, token: result.body.data.access_token, data: result.body.data };
  return { ok: false, fatal: result.status === 401 || result.status === 403, result };
}

const SESSION_EXPIRED: ApiFailure = {
  success: false,
  message: "Your session has expired. Please log in again.",
  code: "session_expired",
};

/** Codes from JwtAuthenticate that mean the token can never work again. */
const DEAD_TOKEN_CODES = new Set(["token_invalid", "token_revoked", "token_missing", "account_blocked"]);

export type SessionCallOutcome<T> = {
  result: BackendResult<T>;
  /** Set when the token was refreshed - caller must store it. */
  newToken?: string;
  /** True when the session is over - caller must clear the cookie. */
  clear: boolean;
};

/**
 * Run a backend call with the user's token, transparently refreshing it:
 *  1. token about to expire  -> refresh first
 *  2. backend says expired   -> refresh once and retry
 *  3. token dead / refresh failed -> report `clear` so the cookie is removed
 */
export async function callWithSession<T>(
  session: SessionCookies,
  call: (token: string | undefined) => Promise<BackendResult<T>>,
  /** Visitor's IP for the token refresh call (lib/api/client-ip.ts). */
  clientIp?: string
): Promise<SessionCallOutcome<T>> {
  let token = session.token;
  let newToken: string | undefined;

  const claims = decodeJwt(token);
  if (token && (!claims || needsRefresh(claims))) {
    const r = await refreshAccessToken(token, clientIp);
    if (r.ok) token = newToken = r.token;
    else if (r.fatal) return { result: { status: 401, body: { ...SESSION_EXPIRED, message: r.result.body.message } }, clear: true };
    // transient failure: try the call with the old token anyway
  }

  let result = await call(token);

  if (result.status === 401 && token && !newToken && !result.body.success && result.body.code === "token_expired") {
    const r = await refreshAccessToken(token, clientIp);
    if (r.ok) {
      token = newToken = r.token;
      result = await call(token);
    } else if (r.fatal) {
      return { result: { status: 401, body: SESSION_EXPIRED }, clear: true };
    }
  }

  const clear =
    !!token &&
    (result.status === 401 || result.status === 403) &&
    !result.body.success &&
    DEAD_TOKEN_CODES.has(result.body.code ?? "");

  return { result, newToken: clear ? undefined : newToken, clear };
}

/** Turn a SessionCallOutcome into a NextResponse, updating the cookie as needed. */
export function sessionResponse<T>(outcome: SessionCallOutcome<T>, remember: boolean, body?: unknown): NextResponse {
  const res = NextResponse.json(body ?? outcome.result.body, { status: outcome.result.status });
  if (outcome.clear) clearSessionCookie(res);
  else if (outcome.newToken) setSessionCookie(res, outcome.newToken, remember);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
