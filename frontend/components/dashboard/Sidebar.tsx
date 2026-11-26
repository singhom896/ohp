"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SidebarMenu } from "@/lib/data/sidebar-menus";

export default function Sidebar({ menu }: { menu: SidebarMenu }) {
  const pathname = usePathname();

  return (
    <aside className="admin-sidebar">
      <div className="side-brand">
        <span className="side-round">✦</span>
        <span>
          <strong>Opportunity Hub</strong>
          <small>{menu.tagline}</small>
        </span>
      </div>

      {menu.sections.map((section) => (
        <nav key={section.title} className="side-section" aria-label={section.title}>
          <div className="side-section-title">{section.title}</div>
          {section.links.map((link) => {
            const active = link.href !== "#" && pathname === link.href;
            return (
              <Link
                key={link.label}
                href={link.href}
                className={active ? "active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {link.icon} {link.label}
                {link.count && <span className="count">{link.count}</span>}
              </Link>
            );
          })}
        </nav>
      ))}
    </aside>
  );
}
