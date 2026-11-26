// Header with the menu managed in the admin console: Administration -> Menus
// (Menu Type "Main Menu", ordered by "Order", active items only; a parent with
// child menus becomes a drop-down). Saving a menu refreshes it (CMS cache tag).
import { Suspense } from "react";
import { getMainMenu } from "@/lib/api/public";
import { mainNav, resolveMenuHref, type NavItem } from "@/lib/data/site-navigation";
import Navbar from "./Navbar";

async function LiveNavbar() {
  const menu = await getMainMenu();
  if (!menu.length) return <Navbar items={mainNav} />;

  const items: NavItem[] = menu.map((m, i) => {
    const external = m.target === "_blank";
    const children = m.children
      .map((c) => ({ label: c.title, href: resolveMenuHref(c.url), external: c.target === "_blank" }))
      .filter((c): c is { label: string; href: string; external: boolean } => c.href !== null);
    if (children.length) return { id: `menu-${i}`, label: m.title, children };
    return { label: m.title, href: resolveMenuHref(m.url) ?? "/", external };
  });

  return <Navbar items={items} />;
}

export default function MainNav() {
  return (
    <Suspense fallback={<Navbar items={mainNav} />}>
      <LiveNavbar />
    </Suspense>
  );
}
