"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

/** Signed-in user's name, role and a Logout button for the dashboard header. */
export default function UserMenu() {
  const { user, status, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  if (status !== "authenticated" || !user) return null;

  return (
    <span className="d-inline-flex align-items-center gap-2">
      <span>
        <strong>{user.name}</strong>
        {user.role.name && <span className="opacity-75"> · {user.role.name}</span>}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await logout();
        }}
      >
        {busy ? "Logging out…" : "Logout"}
      </button>
    </span>
  );
}
