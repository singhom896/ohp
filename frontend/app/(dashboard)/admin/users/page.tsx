import type { Metadata } from "next";
import { UsersList } from "@/components/console/modules/admin";

export const metadata: Metadata = { title: "User Management" };

export default function Page() {
  return <UsersList />;
}
