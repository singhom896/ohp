import type { Metadata } from "next";
import { MenuOrdering } from "@/components/console/modules/menu-ordering";

export const metadata: Metadata = { title: "Manage Menu Ordering" };

export default function Page() {
  return <MenuOrdering />;
}
