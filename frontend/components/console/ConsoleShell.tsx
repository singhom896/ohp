"use client";

// Port of backend/resources/views/backend/layouts/app.blade.php: topbar,
// sidebar, content box, plus the sidebar toggle script from footer.blade.php
// (desktop: body.sidebar-collapsed, mobile <= 992px: body.sidebar-open).
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Topbar from "./Topbar";
import Sidebar from "./Sidebar";
import ModuleGuard from "./ModuleGuard";
import ProfileGate from "./ProfileGate";

export default function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Mirror state onto <body>, where style.css / responsive.css expect it.
  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    document.body.classList.toggle("sidebar-open", mobileOpen);
  }, [collapsed, mobileOpen]);

  // Close the mobile drawer after navigating (adjusting state during render,
  // keyed on the pathname, instead of an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  // Outside click closes the mobile drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".side-navigation") && !t.closest(".main-menu")) setMobileOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [mobileOpen]);

  const isMobile = useIsMobile();
  const toggle = () => {
    if (isMobile) setMobileOpen((o) => !o);
    else setCollapsed((c) => !c);
  };

  return (
    <>
      <Topbar onToggleMenu={toggle} menuExpanded={isMobile ? mobileOpen : !collapsed} />
      <div className="wrapper position-relative">
        <Sidebar collapsed={collapsed} />
        <div className="content-box p-3">
          {/* Dashboards lay their cards straight on the page; other pages keep the white box. */}
          <div className={`data-box rounded-3 shadow-sm p-3${pathname.endsWith("/dashboard") ? " oh-plain" : ""}`}>
            <main id="maincontent">
              {/* Rendered at once (not after /auth/me): proxy.ts already admits
                  only signed-in users, and the page's own API calls then run in
                  parallel with the auth check and the menu. */}
              <ProfileGate>
                <ModuleGuard>{children}</ModuleGuard>
              </ProfileGate>
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

const MOBILE_QUERY = "(max-width: 992px)";

function subscribeMobile(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Same breakpoint as the jQuery toggle; false during SSR. */
function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  );
}
