import type { Metadata } from "next";
import { ProfilePage } from "@/components/console/modules/account";

export const metadata: Metadata = { title: "Update Profile" };

export default function Page() {
  return <ProfilePage />;
}
