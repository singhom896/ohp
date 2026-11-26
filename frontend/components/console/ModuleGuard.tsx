"use client";

// Client-side twin of the `checkPermission:view` middleware. proxy.ts already
// keeps each role inside its own console (/admin or /artist); this checks the
// module inside it, e.g. /admin/art-forms/edit -> module "/art-forms".
// The API enforces the same rule on every call, so this only decides what to
// render: the page, or the "no permission" screen (errors/permission.blade.php).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConsole } from "@/context/ConsoleContext";

/** Console pages every signed-in user may open (not modules). */
const OPEN_PAGES = new Set(["profile", "change-password"]);

export function modulePathFor(pathname: string, base: string): string | null {
  if (!pathname.startsWith(base)) return null;
  const first = pathname.slice(base.length).split("/").filter(Boolean)[0];
  if (!first || OPEN_PAGES.has(first)) return null;
  return `/${first}`;
}

export default function ModuleGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, base, can, href } = useConsole();
  const modulePath = modulePathFor(pathname, base);

  // While the menu loads, the page renders and starts its own API calls in
  // parallel; the API refuses them (403) if the module is not allowed, and this
  // switches to the Access Denied screen as soon as the menu arrives.
  if (!modulePath || status !== "ready") return <>{children}</>;

  if (!can(modulePath, "view")) {
    return (
      <div className="permission-denied" role="alert">
        <i className="bi bi-shield-lock" aria-hidden="true" />
        <h1 className="mt-3 mb-2 fw-bold">Access Denied</h1>
        <p className="text-muted mb-4">You do not have permission to view this module ({modulePath}).</p>
        <Link href={href("/dashboard")} className="theme-btn rounded-2">
          <i className="bi bi-speedometer2 me-1" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  // status "error": the menu could not load; let the page try, the API decides.
  return <>{children}</>;
}
