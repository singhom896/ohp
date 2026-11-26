import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/api/backend";
import { clientIp } from "@/lib/api/client-ip";

/** POST /api/auth/reset-password/check - { email, token }: is the reset link still valid? */
export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  const result = await backendFetch("/auth/reset-password/check", { method: "POST", body: { email: input.email, token: input.token }, clientIp: clientIp(request.headers) });
  return NextResponse.json(result.body, { status: result.status });
}
