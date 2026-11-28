"use client";

// Console header (Opportunity Hub design): Ministry of Culture block on the
// left (same width as the sidebar), brand, decorative artwork, notifications
// and the user menu. Styles: styles/console/theme.css (.oh-*). The menu
// button only shows on tablets/phones, as in the design.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useConsole } from "@/context/ConsoleContext";
import { http } from "@/lib/api/http";

/** Unread in-app notifications; refreshed on navigation and every 2 minutes. */
function useUnreadCount(enabled: boolean): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    const load = () => http.get<{ unread: number }>("/notifications/count").then((r) => !off && setCount(r.data.unread)).catch(() => {});
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(load, 120_000);
    return () => { off = true; window.clearTimeout(first); window.clearInterval(timer); };
  }, [enabled, pathname]);
  return enabled ? count : 0;
}

export default function Topbar({ onToggleMenu, menuExpanded }: { onToggleMenu: () => void; menuExpanded: boolean }) {
  const { user, logout } = useAuth();
  const { base, can, status } = useConsole();
  const [signingOut, setSigningOut] = useState(false);
  const unread = useUnreadCount(status === "ready" && can("/notifications"));

  return (
    <header className="oh-header">
      <div className="oh-gov">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static asset */}
        <img className="oh-emblem" src="/assets/console/emblem-white.png" alt="State Emblem of India" width={62} height={76} />
        <span className="oh-gov-text">
          {/* <small>Government of India</small> */}
          <strong>Ministry of Culture</strong>
          <span lang="hi">संस्कृति मंत्रालय</span>
        </span>
      </div>

      <div className="oh-header-main">
        <button
          type="button"
          className="oh-menu-btn main-menu"
          aria-label="Toggle main menu"
          aria-controls="main-menu"
          aria-expanded={menuExpanded}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu();
          }}
        >
          <i className="bi bi-list" aria-hidden="true" />
        </button>

        <Link className="oh-brand" href="/" target="_blank" aria-label="Opportunity Hub home (opens in a new tab)">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static mark */}
          <img src="/assets/console/oh-mark.png" alt="" width={46} height={50} />
          <span>
            <strong className="oh-brand-name">Opportunity Hub</strong>
            <span className="oh-brand-tag">FOR INDIAN ARTISTS</span>
          </span>
        </Link>

        <div className="oh-header-art" aria-hidden="true" />

        <div className="oh-header-tools">
          <a href="#maincontent" className="visually-hidden-focusable">
            Skip to main content
          </a>
          {/* Select Language: the BHASHINI translation plugin (script in
              app/(dashboard)/layout.tsx) fills this with its language picker, so
              translation keeps working after login. Leave it empty. */}
          <div className="bhashini-plugin-container oh-lang" title="Select Language" suppressHydrationWarning />
          <span className="oh-divider" aria-hidden="true" />
          {/* Notifications: artist and partner consoles (module /notifications). */}
          {can("/notifications") && (
            <>
              <Link href={`${base}/notifications`} className="oh-bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
                <i className="bi bi-bell" aria-hidden="true" />
                {unread > 0 && <span className="oh-bell-count">{unread > 99 ? "99+" : unread}</span>}
              </Link>
              <span className="oh-divider" aria-hidden="true" />
            </>
          )}

          <div className="dropdown">
            <button className="oh-user" type="button" id="ohUserMenu" data-bs-toggle="dropdown" aria-expanded="false" aria-label="User account menu">
              <span className="oh-avatar" aria-hidden="true">
                <i className="bi bi-person-fill" />
              </span>
              <span className="oh-user-text">
                <span className="oh-user-name">{user?.name ?? "…"}</span>
                {user?.role.name && <span className="oh-user-role">{user.role.name}</span>}
              </span>
              <i className="bi bi-chevron-down" aria-hidden="true" />
            </button>

            <ul className="dropdown-menu dropdown-menu-end border mt-2 user-dropdown" aria-labelledby="ohUserMenu">
              {user?.mobile && (
                <li>
                  <span className="dropdown-item d-flex align-items-center fs-7 text-black">
                    <i className="bi bi-telephone fs-5 me-2" />
                    <b>Phone</b>&nbsp;-&nbsp;{user.mobile}
                  </span>
                </li>
              )}
              {user?.email && (
                <li>
                  <span className="dropdown-item d-flex align-items-center fs-7 text-black">
                    <i className="bi bi-envelope fs-5 me-2" />
                    <b>Email</b>&nbsp;-&nbsp;{user.email}
                  </span>
                </li>
              )}
              <li>
                <hr className="dropdown-divider" />
              </li>
              <li>
                <Link className="dropdown-item d-flex align-items-center fs-7 text-black" href={`${base}/profile`}>
                  <i className="bi bi-person-circle fs-5 me-2" />
                  <span>Update Profile</span>
                </Link>
              </li>
              <li>
                <Link className="dropdown-item d-flex align-items-center fs-7 text-black" href={`${base}/change-password`}>
                  <i className="bi bi-pencil-square fs-5 me-2" />
                  <span>Change Password</span>
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  className="dropdown-item d-flex align-items-center fs-7 text-danger"
                  disabled={signingOut}
                  onClick={async () => {
                    setSigningOut(true);
                    await logout();
                  }}
                >
                  <i className="bi bi-box-arrow-right fs-5 me-2" />
                  <span>{signingOut ? "Signing out…" : "Sign Out"}</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </header>
  );
}
