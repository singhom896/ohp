// SERVER-ONLY: imported by route handlers and proxy.ts. Never import from a
// "use client" file - it reads OHP_API_URL and handles raw JWTs.
import type { ApiEnvelope, ApiFailure } from "./types";

const API_URL = (process.env.OHP_API_URL ?? "").replace(/\/+$/, "");

export type BackendResult<T = unknown> = {
  status: number;
  body: ApiEnvelope<T>;
};

type BackendInit = {
  method?: string;
  token?: string;
  /** Plain object -> JSON. FormData / ArrayBuffer / string are sent as-is. */
  body?: unknown;
  headers?: HeadersInit;
  /** Query string including the leading "?" */
  search?: string;
  /** Visitor's IP (lib/api/client-ip.ts), sent as X-Forwarded-For so Laravel's per-IP limits apply per visitor. */
  clientIp?: string;
};

function failure(status: number, message: string, code: string): BackendResult<never> {
  const body: ApiFailure = { success: false, message, code };
  return { status, body };
}

/** Call the Laravel API. Never throws: network errors become a 503 envelope. */
export async function backendFetch<T = unknown>(path: string, init: BackendInit = {}): Promise<BackendResult<T>> {
  if (!API_URL) return failure(500, "OHP_API_URL is not configured.", "config_error");

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.clientIp) headers.set("X-Forwarded-For", init.clientIp);

  let body: BodyInit | undefined;
  const raw = init.body;
  if (raw instanceof FormData || raw instanceof ArrayBuffer || typeof raw === "string") {
    body = raw;
  } else if (raw !== undefined && raw !== null) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(raw);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${init.search ?? ""}`, {
      method: init.method ?? "GET",
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return failure(503, "The server is unreachable. Please try again shortly.", "backend_unreachable");
  }

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json && typeof json === "object" && "success" in json) return { status: res.status, body: json };
    // Valid JSON but not our envelope (e.g. a raw Laravel error page in debug mode).
    return failure(res.status >= 400 ? res.status : 502, json?.message ?? "Unexpected server response.", "bad_response");
  } catch {
    return failure(res.status >= 400 ? res.status : 502, "Unexpected server response.", "bad_response");
  }
}
