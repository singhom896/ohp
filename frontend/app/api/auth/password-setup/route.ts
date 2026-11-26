import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/api/backend";
import { clientIp } from "@/lib/api/client-ip";

/** POST /api/auth/password-setup - { token, password, password_confirmation } -> PasswordSetupController@store. */
export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  const body = {
    token: input.token,
    password: input.password,
    password_confirmation: input.password_confirmation,
  };
  const result = await backendFetch("/auth/password-setup", { method: "POST", body, clientIp: clientIp(request.headers) });
  return NextResponse.json(result.body, { status: result.status });
}
