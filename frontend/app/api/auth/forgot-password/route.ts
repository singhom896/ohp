import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/api/backend";
import { clientIp } from "@/lib/api/client-ip";

/** POST /api/auth/forgot-password - { email, captcha, captcha_key } -> Laravel PasswordResetController@forgot. */
export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  const body = { email: input.email, captcha: input.captcha, captcha_key: input.captcha_key };
  const result = await backendFetch("/auth/forgot-password", { method: "POST", body, clientIp: clientIp(request.headers) });
  return NextResponse.json(result.body, { status: result.status });
}
