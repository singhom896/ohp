// Browser-side API client. Calls the Next.js BFF at /api/*, which attaches the
// JWT from the httpOnly cookie and forwards to Laravel (app/api/[...path]).
//
//   const { data } = await api.get<{ items: Opportunity[] }>("/opportunities?page=2");
//   await api.post("/opportunities", { title: "..." });
//   await api.post("/documents", formData);   // multipart upload
import type { ApiFailure, ApiSuccess } from "./types";

/** Fired on window when the server says the session is over; AuthProvider listens. */
export const SESSION_EXPIRED_EVENT = "ohp:session-expired";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly errors: Record<string, string[]>;

  constructor(status: number, body: Partial<ApiFailure>) {
    super(body.message || "Something went wrong. Please try again.");
    this.name = "ApiError";
    this.status = status;
    this.code = body.code ?? null;
    this.errors = body.errors ?? {};
  }

  /** First validation message for a field, if any. */
  field(name: string): string | undefined {
    return this.errors[name]?.[0];
  }
}

type Options = Omit<RequestInit, "body" | "method"> & { body?: unknown };

async function request<T>(method: string, path: string, opts: Options = {}): Promise<ApiSuccess<T>> {
  const { body, headers, ...rest } = opts;
  const h = new Headers(headers);
  h.set("Accept", "application/json");

  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    h.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path.startsWith("/") ? path : `/${path}`}`, {
      ...rest,
      method,
      headers: h,
      body: payload,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, { message: "Network error. Please check your connection.", code: "network_error" });
  }

  const json = await res.json().catch(() => ({}));
  if (res.ok && json.success) return json as ApiSuccess<T>;

  if (res.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: json?.message }));
  }
  throw new ApiError(res.status, json);
}

export const api = {
  get: <T>(path: string, opts?: Options) => request<T>("GET", path, opts),
  post: <T>(path: string, body?: unknown, opts?: Options) => request<T>("POST", path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: Options) => request<T>("PUT", path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: Options) => request<T>("PATCH", path, { ...opts, body }),
  delete: <T>(path: string, opts?: Options) => request<T>("DELETE", path, opts),
};
