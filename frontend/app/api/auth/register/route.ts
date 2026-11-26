import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/api/backend";
import { clientIp } from "@/lib/api/client-ip";

/** Fields Laravel's AuthController::register accepts (anything else is dropped). */
const FIELDS = [
  "account_type",
  "first_name",
  "last_name",
  "group_name",
  "organisation_name",
  "organisation_type",
  "partner_type",
  "address",
  "designation",
  "mobile",
  "email",
  "email_otp_token",
  "mobile_otp_token",
  "password",
  "password_confirmation",
  "terms",
  "privacy",
  "captcha",
  "captcha_key",
] as const;

/** POST /api/auth/register - passes the registration through to Laravel. */
export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  const body = Object.fromEntries(FIELDS.filter((f) => input[f] !== undefined).map((f) => [f, input[f]]));

  const result = await backendFetch("/auth/register", { method: "POST", body, clientIp: clientIp(request.headers) });

  return NextResponse.json(result.body, { status: result.status });
}
