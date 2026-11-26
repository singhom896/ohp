import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/api/backend";
import { clientIp } from "@/lib/api/client-ip";

/** POST /api/auth/password-setup/check - { token }: is the set-password link still valid? -> { email } */
export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  const result = await backendFetch("/auth/password-setup/check", { method: "POST", body: { token: input.token }, clientIp: clientIp(request.headers) });
  return NextResponse.json(result.body, { status: result.status });
}
