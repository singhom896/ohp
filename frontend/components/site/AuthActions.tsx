"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { homePathFor } from "@/lib/auth/roles";

/** Login/Register buttons, or Dashboard/Logout once the session is verified. */
export default function AuthActions() {
  const { user, status, logout } = useAuth();

  if (status === "authenticated" && user) {
    const home = homePathFor(user.role.id);
    return (
      <>
        {home !== "/" && (
          <Link className="btn btn-ghost" href={home}>
            Dashboard
          </Link>
        )}
        <button type="button" className="btn btn-primary" onClick={() => logout()}>
          Logout
        </button>
      </>
    );
  }

  return (
    <>
      <Link className="btn btn-ghost" href="/login">Login</Link>
      <Link className="btn btn-primary" href="/register">Register</Link>
    </>
  );
}
