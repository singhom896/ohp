// Sidebar menus per console. Each role-specific layout passes one of these to
// <Sidebar />. Add the artist / organizer / zonal menus here as those pages migrate.

export type SidebarLink = { href: string; icon: string; label: string; count?: string };
export type SidebarSection = { title: string; links: SidebarLink[] };
export type SidebarMenu = { tagline: string; sections: SidebarSection[] };

export const ministryMenu: SidebarMenu = {
  tagline: "MINISTRY CONSOLE",
  sections: [
    {
      title: "Overview",
      links: [
        { href: "/ministry/dashboard", icon: "▦", label: "Dashboard" },
        { href: "#", icon: "♙", label: "Artists", count: "25K+" },
        { href: "#", icon: "⌂", label: "Organisations / NGOs" },
        { href: "#", icon: "◈", label: "Groups" },
      ],
    },
    {
      title: "Operations",
      links: [
        { href: "#", icon: "⌕", label: "Artist Search" },
        { href: "#", icon: "◷", label: "Bookings", count: "128" },
        { href: "#", icon: "✓", label: "Accreditation" },
        { href: "#", icon: "▤", label: "Reports & MIS" },
      ],
    },
    {
      title: "Administration",
      links: [
        { href: "#", icon: "⚙", label: "User Management" },
        { href: "#", icon: "◎", label: "ZCC / Akademi" },
        { href: "#", icon: "⌁", label: "Audit Trail" },
      ],
    },
  ],
};
