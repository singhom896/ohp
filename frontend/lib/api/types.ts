/** Envelope returned by every Laravel API endpoint (see backend ApiResponse trait). */
export type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export type ApiFailure = {
  success: false;
  message: string;
  /** Stable machine-readable code, e.g. "validation_error", "token_expired", "session_expired". */
  code: string | null;
  /** Field -> messages, present for validation_error. */
  errors?: Record<string, string[]>;
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export type AuthUser = {
  id: number;
  regno: string | null;
  name: string;
  email: string;
  mobile: string | null;
  role: { id: number; name: string | null };
  last_login_at: string | null;
  /** Artist accounts: has the full profile been submitted? */
  profile_completed?: boolean;
  /** Artist accounts: incomplete profile, but an update is waiting for review. */
  profile_pending?: boolean;
};

/** data of POST /auth/login and /auth/refresh on the Laravel side. */
export type TokenData = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  refresh_ttl: number;
  user: AuthUser;
};
