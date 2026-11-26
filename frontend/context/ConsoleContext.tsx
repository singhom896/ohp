"use client";

// Console (after-login) state: the role's sidebar menu and module permissions,
// loaded from GET /api/console/menu (Laravel modules + permissions tables, the
// same data getSidebar() / @permission use in the Blade panel).
//
//   const { can } = useConsole();
//   can("/art-forms", "create")   // show the Create button?
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { http } from "@/lib/api/http";
import { useAuth } from "@/context/AuthContext";
import { consoleBaseFor } from "@/lib/auth/roles";

export type Action = "view" | "create" | "edit" | "delete";
export type ModulePermissions = Record<Action, boolean>;

export type MenuNode = {
  id: number;
  name: string;
  /** Laravel page_url, e.g. "/art-forms", or "#" for a group heading. */
  url: string;
  /** Bootstrap Icons class without the "bi" prefix, e.g. "bi-palette". */
  icon: string;
  children: MenuNode[];
};

type MenuResponse = {
  menu: MenuNode[];
  permissions: Record<string, ModulePermissions>;
  is_super_admin: boolean;
};

type ConsoleValue = {
  status: "loading" | "ready" | "error";
  menu: MenuNode[];
  /** "/admin", "/artist" or "/partner": prefix for every console link. */
  base: string;
  isSuperAdmin: boolean;
  /** Can the user do `action` on the module whose Laravel page_url is `modulePath`? */
  can: (modulePath: string, action?: Action) => boolean;
  /** Console href for a Laravel page_url: "/art-forms" -> "/admin/art-forms". */
  href: (pageUrl: string) => string;
  reload: () => Promise<void>;
};

const ConsoleContext = createContext<ConsoleValue | null>(null);

export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const { user, status: authStatus } = useAuth();
  const [data, setData] = useState<MenuResponse | null>(null);
  const [status, setStatus] = useState<ConsoleValue["status"]>("loading");

  // The console prefix of the current URL (proxy.ts only lets each role into its
  // own console), falling back to the role's console.
  const pathname = usePathname();
  const fromPath = (["/admin", "/artist", "/partner"] as const).find((p) => pathname === p || pathname.startsWith(`${p}/`));
  const base = fromPath ?? consoleBaseFor(user?.role.id) ?? "/admin";

  const load = useCallback(async () => {
    try {
      const res = await http.get<MenuResponse>("/console/menu");
      setData(res.data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  // Start loading the menu straight away, in parallel with AuthProvider's
  // /auth/me check (proxy.ts already let only signed-in users reach a console
  // page), then reload whenever the signed-in user changes (login in another tab).
  useEffect(() => {
    const t = window.setTimeout(load, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const userId = user?.id;
  const [menuUser, setMenuUser] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (authStatus !== "authenticated" || userId === undefined) return;
    if (menuUser === undefined) {
      // First confirmed user: the menu loaded above is already theirs.
      const t = window.setTimeout(() => setMenuUser(userId), 0);
      return () => window.clearTimeout(t);
    }
    if (menuUser !== userId) {
      const t = window.setTimeout(() => {
        setMenuUser(userId);
        load();
      }, 0);
      return () => window.clearTimeout(t);
    }
  }, [authStatus, userId, menuUser, load]);

  const value = useMemo<ConsoleValue>(() => {
    const perms = data?.permissions ?? {};
    return {
      status,
      menu: data?.menu ?? [],
      base,
      isSuperAdmin: !!data?.is_super_admin,
      can: (modulePath, action = "view") => {
        if (modulePath === "/permissions" && data?.is_super_admin) return true;
        return !!perms[modulePath]?.[action];
      },
      href: (pageUrl) => (pageUrl && pageUrl !== "#" ? `${base}${pageUrl.startsWith("/") ? pageUrl : `/${pageUrl}`}` : "#"),
      reload: load,
    };
  }, [data, status, base, load]);

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole(): ConsoleValue {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used inside <ConsoleProvider>");
  return ctx;
}
