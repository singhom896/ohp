// Base axios instance for console pages (browser side).
//
// Requests go to the Next.js BFF at /api/*, never to Laravel directly: the BFF
// (app/api/[...path]/route.ts) reads the JWT from the httpOnly cookie, refreshes
// it when needed, and forwards to {OHP_API_URL}. So no token handling here.
//
//   const { data } = await http.get<{ items: Region[] }>("/masters/regions");
//   await http.post("/banners", formData);          // multipart upload
//   await http.patch(`/banners/${id}/status`, { status: 1 });
//
// Every call resolves to Laravel's `ApiSuccess<T>` envelope; failures reject
// with ApiError (same class as lib/api/client.ts) so forms can read field errors.
import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { ApiError, SESSION_EXPIRED_EVENT } from "./client";
import type { ApiFailure, ApiSuccess } from "./types";

export const axiosInstance = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { Accept: "application/json" },
  timeout: 60_000,
});

axiosInstance.interceptors.response.use(
  (res) => res,
  (error: AxiosError<Partial<ApiFailure>>) => {
    if (!error.response) {
      return Promise.reject(new ApiError(0, { message: "Network error. Please check your connection.", code: "network_error" }));
    }
    const { status, data } = error.response;
    if (status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: data?.message }));
    }
    return Promise.reject(new ApiError(status, data ?? {}));
  }
);

async function unwrap<T>(p: Promise<{ data: ApiSuccess<T> }>): Promise<ApiSuccess<T>> {
  const res = await p;
  if (!res.data?.success) throw new ApiError(500, res.data as unknown as Partial<ApiFailure>);
  return res.data;
}

export const http = {
  get: <T>(url: string, config?: AxiosRequestConfig) => unwrap<T>(axiosInstance.get(url, config)),
  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>(axiosInstance.post(url, body, config)),
  put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>(axiosInstance.put(url, body, config)),
  patch: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>(axiosInstance.patch(url, body, config)),
  delete: <T>(url: string, config?: AxiosRequestConfig) => unwrap<T>(axiosInstance.delete(url, config)),
};

/** Build multipart FormData from a plain object (arrays -> name[]; null/undefined skipped). */
export function toFormData(values: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((v) => fd.append(`${key}[]`, v instanceof Blob ? v : String(v)));
    else if (value instanceof Blob) fd.append(key, value);
    else if (typeof value === "boolean") fd.append(key, value ? "1" : "0");
    else fd.append(key, String(value));
  }
  return fd;
}

export default http;
