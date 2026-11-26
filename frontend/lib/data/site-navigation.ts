// Navigation content for the public site (header mega menus, top links, footer).
// Keeping it as data means the Navbar/Footer components stay markup-only.

export type NavLink = { href: string; label: string; external?: boolean };
export type NavItem = NavLink | { id: string; label: string; children: NavLink[] };

/**
 * Menu URLs that this site serves at a different address. Every other menu URL
 * is used as-is; these pages exist with the same URL as on the Laravel site:
 * /artist-list, /art-forms, /bulletin, /faq, /gallery, /events (app/(site)/...).
 * Add a row here when an admin menu points to a page this site lacks.
 */
const MENU_URL_ALIASES: Record<string, string> = {
  "/artist-registration": "/register",
};

/** A menu URL as this site serves it; null for "#" / empty (a drop-down heading). */
export function resolveMenuHref(url: string): string | null {
  const u = url.trim();
  if (!u || u === "#") return null;
  if (/^https?:\/\//i.test(u)) return u;
  const path = u.startsWith("/") ? u : `/${u}`;
  return MENU_URL_ALIASES[path.replace(/\/+$/, "") || "/"] ?? path;
}

/**
 * Header menu used while the CMS menu loads, or when Laravel is unreachable.
 * The live menu comes from Administration -> Menus ("Main Menu"): see
 * components/site/MainNav.tsx.
 */
export const mainNav: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/about-us", label: "About Us" },
  { href: "/contact-us", label: "Contact Us" },
];

/**
 * CMS menu URLs that the Laravel site serves as its own pages but this site
 * shows as CMS content pages (next.config.ts rewrites them to /content/<slug>).
 */
export const CMS_PAGE_ALIASES = ["/about-us", "/contact-us", "/help-centre", "/faq"];
