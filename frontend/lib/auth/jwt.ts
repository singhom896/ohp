import { REFRESH_BEFORE_SECONDS } from "./config";

export type JwtClaims = {
  sub?: string | number;
  role?: number;
  exp?: number; // seconds since epoch
  iat?: number;
};

/**
 * Read a JWT's claims WITHOUT verifying its signature.
 *
 * Only for optimistic decisions (redirects, "refresh soon?"). The signature is
 * verified by Laravel on every API call, so a forged token gets the user
 * nothing beyond seeing an empty page shell that immediately logs them out.
 */
export function decodeJwt(token: string | undefined | null): JwtClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" ? (claims as JwtClaims) : null;
  } catch {
    return null;
  }
}

/** Seconds until the token expires (negative once expired). */
export function secondsUntilExpiry(claims: JwtClaims): number {
  return (claims.exp ?? 0) - Math.floor(Date.now() / 1000);
}

/** True when the token is expired or will expire within REFRESH_BEFORE_SECONDS. */
export function needsRefresh(claims: JwtClaims): boolean {
  return secondsUntilExpiry(claims) <= REFRESH_BEFORE_SECONDS;
}
