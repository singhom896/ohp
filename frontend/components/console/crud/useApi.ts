"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { http } from "@/lib/api/http";
import { ApiError } from "@/lib/api/client";

/** GET `url` (null = skip) and keep the `data` part of the envelope. */
export function useApiData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await http.get<T>(url);
      if (mine === seq.current) {
        setData(res.data);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(e instanceof ApiError ? e.message : "Unable to load data.");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    // Deferred so no state is set synchronously inside the effect.
    const t = window.setTimeout(load, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  return { data, setData, error, loading, reload: load };
}

/** Cached GETs for dependent dropdowns (url -> data). */
const optionCache = new Map<string, Promise<unknown>>();

export function fetchCached<T>(url: string): Promise<T> {
  if (!optionCache.has(url)) {
    const p = http.get<T>(url).then((r) => r.data);
    p.catch(() => optionCache.delete(url));
    optionCache.set(url, p);
  }
  return optionCache.get(url) as Promise<T>;
}
