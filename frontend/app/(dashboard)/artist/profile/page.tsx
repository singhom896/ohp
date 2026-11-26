import type { Metadata } from "next";
import { ArtistProfilePage } from "@/components/console/modules/artist-profile";

export const metadata: Metadata = { title: "My Profile" };

// Artist accounts (Individual / Group / Organisation) fill their full profile
// here. Password changes stay on /artist/change-password.
export default function Page() {
  return <ArtistProfilePage />;
}
