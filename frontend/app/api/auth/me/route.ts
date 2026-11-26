import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { backendFetch } from "@/lib/api/backend";
import { clientIp } from "@/lib/api/client-ip";
import type { AuthUser } from "@/lib/api/types";
import { callWithSession, readSession, sessionResponse } from "@/lib/auth/session";

/**
 * GET /api/auth/me - the auto-verify endpoint used by AuthProvider.
 * Laravel checks the token signature + account status; an expiring token is
 * refreshed on the way and the cookie updated.
 */
export async function GET(request: Request) {
  const session = readSession(await cookies());

  if (!session.token) {
    return NextResponse.json(
      { success: false, message: "Not logged in.", code: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const ip = clientIp(request.headers);
  const outcome = await callWithSession(session, (token) => backendFetch<{ user: AuthUser }>("/auth/me", { token, clientIp: ip }), ip);

  return sessionResponse(outcome, session.remember);
}
