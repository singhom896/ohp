"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Collapse } from "bootstrap";
import type { NavItem, NavLink } from "@/lib/data/site-navigation";
import AuthActions from "@/components/site/AuthActions";

/**
 * Main site navigation.
 * - Menu items come from the admin console via MainNav.tsx; an item with
 *   children is a small drop-down whose open state is React state.
 * - Mobile menu (< 1200px): Bootstrap 5 Collapse via data-bs-toggle on the
 *   toggler; we keep a handle on the instance so the menu can close itself
 *   after a link is chosen or Escape is pressed.
 */
/** Internal links use next/link; external ones (target "_blank" in the admin) open a new tab. */
function MenuLink({ link, className, current }: { link: NavLink; className?: string; current?: boolean }) {
  if (link.external || /^https?:\/\//i.test(link.href)) {
    return (
      <a className={className} href={link.href} target="_blank" rel="noopener noreferrer">
        {link.label}
      </a>
    );
  }
  return (
    <Link className={className} href={link.href} aria-current={current ? "page" : undefined}>
      {link.label}
    </Link>
  );
}

export default function Navbar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const collapseRef = useRef<Collapse | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("bootstrap").then(({ Collapse }) => {
      if (!cancelled && navRef.current) {
        collapseRef.current = Collapse.getOrCreateInstance(navRef.current, { toggle: false });
      }
    });

    // Click anywhere outside a dropdown trigger closes the open mega menu.
    const onDocumentClick = (e: globalThis.MouseEvent) => {
      if (!(e.target as Element | null)?.closest(".trigger")) setOpenMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenMenu(null);
        collapseRef.current?.hide();
      }
    };
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelled = true;
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Choosing any link inside the menu closes the dropdown and the mobile menu.
  const onNavClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as Element).closest("a")) {
      setOpenMenu(null);
      collapseRef.current?.hide();
    }
  };

  return (
    <header>
      <div className="container nav-row">
        <Link className="brand" href="/">
          <Image className="brand-logo" src="/assets/console/oh-mark.png" alt="" width={112} height={122} priority />
          <span className="brand-copy">
            <strong>Opportunity Hub</strong>
            <span>FOR INDIAN ARTISTS</span>
          </span>
        </Link>

        <nav
          className="main-nav collapse"
          id="mainNav"
          aria-label="Main navigation"
          ref={navRef}
          onClick={onNavClick}
        >
          {items.map((item) =>
            "children" in item ? (
              <div key={item.id} className={`nav-dropdown${openMenu === item.id ? " open" : ""}`}>
                <button
                  type="button"
                  className="nav-item trigger"
                  aria-expanded={openMenu === item.id}
                  onClick={() => setOpenMenu((current) => (current === item.id ? null : item.id))}
                >
                  {item.label}
                  <i className="bi bi-chevron-down nav-caret" aria-hidden="true" />
                </button>
                <div className="nav-submenu">
                  {item.children.map((child) => (
                    <MenuLink key={child.label} link={child} current={pathname === child.href} />
                  ))}
                </div>
              </div>
            ) : (
              <MenuLink
                key={item.label}
                link={item}
                className={`nav-item${pathname === item.href ? " active" : ""}`}
                current={pathname === item.href}
              />
            )
          )}

          <div className="nav-mobile-actions">
            <AuthActions />
          </div>
        </nav>

        <div className="nav-actions">
          <AuthActions />
        </div>

        <button
          className="nav-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#mainNav"
          aria-controls="mainNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="nav-toggler-bar" />
          <span className="nav-toggler-bar" />
          <span className="nav-toggler-bar" />
        </button>
      </div>
    </header>
  );
}
