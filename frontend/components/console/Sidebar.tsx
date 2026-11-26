"use client";

// Port of backend/resources/views/backend/layouts/partials/sidebar.blade.php +
// sidebar-item.blade.php + the submenu accordion script in footer.blade.php.
// Items come from GET /api/console/menu, so each role only sees the modules
// it has `can_view` on (same as getSidebar()).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useConsole, type MenuNode } from "@/context/ConsoleContext";

function isActive(node: MenuNode, pathname: string, href: (u: string) => string): boolean {
  if (node.url && node.url !== "#") {
    const h = href(node.url);
    if (pathname === h || pathname.startsWith(h + "/")) return true;
  }
  return node.children.some((c) => isActive(c, pathname, href));
}

function MenuItem({
  node,
  pathname,
  openId,
  setOpenId,
  collapsed,
}: {
  node: MenuNode;
  pathname: string;
  openId: number | null;
  setOpenId: (id: number | null) => void;
  collapsed: boolean;
}) {
  const { href } = useConsole();
  const active = isActive(node, pathname, href);

  if (node.children.length === 0) {
    return (
      <li className={`menu-item${active ? " active" : ""}`}>
        <Link href={href(node.url)} className="menu-link" aria-current={active ? "page" : undefined}>
          <i className={`bi ${node.icon}`} />
          <span>{node.name}</span>
        </Link>
      </li>
    );
  }

  const open = !collapsed && openId === node.id;
  return (
    <li className={`menu-item${active ? " active" : ""}`}>
      <button
        type="button"
        className="menu-link submenu-toggle"
        aria-expanded={open}
        aria-controls={`menu-${node.id}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (collapsed) return;
          setOpenId(open ? null : node.id);
        }}
      >
        <i className={`bi ${node.icon}`} />
        <span>{node.name}</span>
        <i className={`bi bi-chevron-down ms-auto${open ? " rotate" : ""}`} />
      </button>
      <ul className={`submenu list-unstyled${open ? " show" : ""}`} id={`menu-${node.id}`}>
        {node.children.map((child) => (
          <ChildItem key={child.id} node={child} pathname={pathname} />
        ))}
      </ul>
    </li>
  );
}

/** Second level: plain links (the panel has two levels). */
function ChildItem({ node, pathname }: { node: MenuNode; pathname: string }) {
  const { href } = useConsole();
  const active = isActive(node, pathname, href);
  return (
    <li className={`menu-item${active ? " active" : ""}`}>
      <Link href={href(node.url)} className="menu-link" aria-current={active ? "page" : undefined}>
        <i className={`bi ${node.icon}`} />
        <span>{node.name}</span>
      </Link>
    </li>
  );
}

export default function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { menu, status, href } = useConsole();

  // The group containing the current page starts open; the user can then open
  // any one group at a time (accordion), like the jQuery version.
  const activeGroup = menu.find((m) => m.children.length > 0 && isActive(m, pathname, href))?.id ?? null;
  const [userOpenId, setUserOpenId] = useState<number | null | undefined>(undefined);
  const openId = userOpenId === undefined ? activeGroup : userOpenId;

  return (
    <nav className="side-navigation bg-blue" id="main-menu" aria-label="Side Navigation">
      <ul className="side-menu list-unstyled mb-0 py-2">
        {status === "loading" && (
          <li className="menu-item">
            <span className="menu-link">
              <span className="spinner-border spinner-border-sm" aria-hidden="true" />
              <span>Loading menu…</span>
            </span>
          </li>
        )}
        {status === "error" && (
          <li className="menu-item">
            <span className="menu-link">
              <i className="bi bi-exclamation-triangle" />
              <span>Menu unavailable</span>
            </span>
          </li>
        )}
        {menu.map((node) => (
          <MenuItem
            key={node.id}
            node={node}
            pathname={pathname}
            openId={openId}
            setOpenId={setUserOpenId}
            collapsed={collapsed}
          />
        ))}
      </ul>
      <SideArt />
    </nav>
  );
}

/** Folk-art illustration at the foot of the sidebar (from the design). */
function SideArt() {
  // eslint-disable-next-line @next/next/no-img-element -- decorative static asset
  return <img className="oh-side-art" src="/assets/console/sidebar-art.png" alt="" aria-hidden="true" width={284} height={262} />;
}
