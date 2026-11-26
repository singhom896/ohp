"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError, SESSION_EXPIRED_EVENT } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { VERIFY_INTERVAL_MS } from "@/lib/auth/config";
import { canAccess, homePathFor, isProtectedPath, safeRedirectPath } from "@/lib/auth/roles";
type Status = "loading" | "authenticated" | "unauthenticated";

/** Code typed by the user + the key from GET /api/captcha. */
export type CaptchaAnswer = { captcha: string; captcha_key: string };

type AuthContextValue = {
  user: AuthUser | null;
  status: Status;
  /** Logs in and redirects to ?next= or the role's dashboard. Throws ApiError on failure. */
  login: (login: string, password: string, remember: boolean, captcha: CaptchaAnswer) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Re-check the session with the backend now. */
  verify: () => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Tabs tell each other about login/logout so they stay in sync. */
const CHANNEL = "ohp-auth";

/**
 * Keeps the browser's idea of "who is logged in" verified against Laravel:
 *  - on first load
 *  - when the tab regains focus / becomes visible (at most every 30 s)
 *  - every VERIFY_INTERVAL_MS while open
 *  - whenever any API call returns 401 (SESSION_EXPIRED_EVENT)
 *  - when another tab logs in or out
 * If the session dies on a protected page the user is sent to /login.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  const lastVerify = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

  const sendToLogin = useCallback(
    (reason: "expired" | "logout") => {
      const path = pathRef.current;
      if (!isProtectedPath(path)) return;
      const qs = new URLSearchParams({ next: path + window.location.search });
      if (reason === "expired") qs.set("reason", "expired");
      router.replace(`/login?${qs}`);
    },
    [router]
  );

  const signedOut = useCallback(
    (reason: "expired" | "logout") => {
      setUser(null);
      setStatus("unauthenticated");
      sendToLogin(reason);
    },
    [sendToLogin]
  );

  const verify = useCallback(async (): Promise<AuthUser | null> => {
    lastVerify.current = Date.now();
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401 || res.status === 403) {
        signedOut("expired");
        return null;
      }
      const json = await res.json();
      // Backend down / unexpected reply: keep the current state, retry on the next trigger.
      if (!res.ok || !json.success) {
        setStatus((s) => (s === "loading" ? "unauthenticated" : s));
        return null;
      }
      const u: AuthUser = json.data.user;
      setUser(u);
      setStatus("authenticated");
      // Role changed server-side and this page is no longer allowed.
      if (!canAccess(pathRef.current, u.role.id)) router.replace(homePathFor(u.role.id));
      return u;
    } catch {
      setStatus((s) => (s === "loading" ? "unauthenticated" : s));
      return null;
    }
  }, [router, signedOut]);

  useEffect(() => {
    // Deferred so the first verify does not set state synchronously inside the effect.
    const first = window.setTimeout(verify, 0);

    const maybeVerify = () => {
      if (document.visibilityState === "visible" && Date.now() - lastVerify.current > 30_000) verify();
    };
    const onExpired = () => signedOut("expired");
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") verify();
    }, VERIFY_INTERVAL_MS);

    window.addEventListener("focus", maybeVerify);
    document.addEventListener("visibilitychange", maybeVerify);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel(CHANNEL);
      channel.current.onmessage = (e) => {
        if (e.data === "logout") signedOut("logout");
        else if (e.data === "login") verify();
      };
    }

    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener("focus", maybeVerify);
      document.removeEventListener("visibilitychange", maybeVerify);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      channel.current?.close();
      channel.current = null;
    };
  }, [signedOut, verify]);

  const login = useCallback(
    async (loginId: string, password: string, remember: boolean, captcha: CaptchaAnswer) => {
      const res = await api.post<{ user: AuthUser }>("/auth/login", { login: loginId, password, remember, ...captcha });
      const u = res.data.user;
      setUser(u);
      setStatus("authenticated");
      lastVerify.current = Date.now();
      channel.current?.postMessage("login");
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(safeRedirectPath(next, u.role.id));
      return u;
    },
    [router]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }
    channel.current?.postMessage("logout");
    setUser(null);
    setStatus("unauthenticated");
    router.replace("/login");
  }, [router]);

  const value = useMemo(() => ({ user, status, login, logout, verify }), [user, status, login, logout, verify]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
