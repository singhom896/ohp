import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/api/backend";
import { clientIp } from "@/lib/api/client-ip";

/** POST /api/auth/reset-password - { email, token, password, password_confirmation } -> PasswordResetController@reset. */
export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  const body = {
    email: input.email,
    token: input.token,
    password: input.password,
    password_confirmation: input.password_confirmation,
  };
  const result = await backendFetch("/auth/reset-password", { method: "POST", body, clientIp: clientIp(request.headers) });
  return NextResponse.json(result.body, { status: result.status });
}
