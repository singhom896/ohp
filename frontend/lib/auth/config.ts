/** httpOnly cookie that holds the Laravel JWT. Never readable from browser JS. */
export const AUTH_COOKIE = "ohp_token";

/** Set when the user ticked "Remember me", so refreshed tokens keep the same persistence. */
export const REMEMBER_COOKIE = "ohp_remember";

/** Refresh the access token when it has less than this many seconds left. */
export const REFRESH_BEFORE_SECONDS = 120;

/** Must match JWT_REFRESH_TTL in backend/.env (minutes x 60). Used as the "remember me" cookie lifetime. */
export const REFRESH_WINDOW_SECONDS = 14 * 24 * 60 * 60;

/** How often the client re-verifies the session with the backend while a tab is open. */
export const VERIFY_INTERVAL_MS = 5 * 60 * 1000;

/** Pages a signed-in user should not see (they are sent to their dashboard instead). */
export const AUTH_PAGES = ["/login", "/register"];
