import type { Metadata } from "next";
import { MenusCreate } from "@/components/console/modules/admin";

export const metadata: Metadata = { title: "Create Menu" };

export default function Page() {
  return <MenusCreate />;
}
