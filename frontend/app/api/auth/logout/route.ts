import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { backendFetch } from "@/lib/api/backend";
import { clientIp } from "@/lib/api/client-ip";
import { clearSessionCookie, readSession } from "@/lib/auth/session";

/** POST /api/auth/logout - revokes the JWT on Laravel (best effort) and clears the cookie. */
export async function POST(request: Request) {
  const { token } = readSession(await cookies());

  if (token) {
    await backendFetch("/auth/logout", { method: "POST", token, clientIp: clientIp(request.headers) });
  }

  const res = NextResponse.json({ success: true, message: "Logged out successfully.", data: null });
  clearSessionCookie(res);
  return res;
}
