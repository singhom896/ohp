import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/api/backend";
import { clientIp } from "@/lib/api/client-ip";
import type { AuthUser, TokenData } from "@/lib/api/types";
import { setSessionCookie } from "@/lib/auth/session";

/**
 * POST /api/auth/login  { login, password, remember, captcha, captcha_key }
 * Logs in against Laravel and stores the JWT in an httpOnly cookie.
 * The token itself is never returned to the browser.
 */
export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));

  const result = await backendFetch<TokenData>("/auth/login", {
    method: "POST",
    body: { login: input.login, password: input.password, captcha: input.captcha, captcha_key: input.captcha_key },
    headers: { "User-Agent": request.headers.get("user-agent") ?? "" },
    clientIp: clientIp(request.headers),
  });

  if (!result.body.success) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const { access_token, user } = result.body.data;
  const res = NextResponse.json(
    { success: true, message: result.body.message, data: { user } satisfies { user: AuthUser } },
    { status: 200 }
  );
  setSessionCookie(res, access_token, input.remember === true);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
