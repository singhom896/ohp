import type { Metadata } from "next";
import { RolesList } from "@/components/console/modules/admin";

export const metadata: Metadata = { title: "Role Management" };

export default function Page() {
  return <RolesList />;
}
