import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { backendFetch } from "@/lib/api/backend";
import { clientIp } from "@/lib/api/client-ip";
import { callWithSession, readSession, sessionResponse } from "@/lib/auth/session";
import { revalidateTag } from "next/cache";
import { CMS_TAG } from "@/lib/api/public";

/**
 * Generic authenticated proxy:  /api/<anything>  ->  {OHP_API_URL}/<anything>
 *
 * Browser code calls e.g. api.get("/opportunities") which hits
 * /api/opportunities here; we attach the JWT from the httpOnly cookie,
 * refresh it automatically when needed, and pass Laravel's response back.
 * /api/auth/* has its own handlers and never reaches this file.
 */
type Ctx = { params: Promise<{ path: string[] }> };

async function forward(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;

  // Auth endpoints return raw tokens; only the dedicated /api/auth/* handlers may call them.
  if (path[0] === "auth") {
    return NextResponse.json({ success: false, message: "Not found.", code: "http_404" }, { status: 404 });
  }

  const session = readSession(await cookies());
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // Read the body once so it can be re-sent if the token is refreshed and the call retried.
  let body: FormData | ArrayBuffer | undefined;
  const headers: Record<string, string> = {};
  if (method !== "GET" && method !== "HEAD") {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("multipart/form-data")) {
      body = await request.formData(); // fetch sets the multipart boundary itself
    } else {
      const buf = await request.arrayBuffer();
      if (buf.byteLength > 0) {
        body = buf;
        if (type) headers["Content-Type"] = type;
      }
    }
  }

  const ip = clientIp(request.headers);
  const outcome = await callWithSession(session, (token) =>
    backendFetch(`/${path.map(encodeURIComponent).join("/")}`, {
      method,
      token,
      body,
      headers,
      search: url.search,
      clientIp: ip,
    }),
    ip
  );

  // Content / menu edits in the console: drop the public site's cached copies
  // (lib/api/public.ts) so the change shows on the next page view.
  if (method !== "GET" && outcome.result.status < 400 && CMS_RESOURCES.has(path[0])) {
    revalidateTag(CMS_TAG, { expire: 0 });
  }

  return sessionResponse(outcome, session.remember);
}

/** Console API resources whose changes affect the public website. */
const CMS_RESOURCES = new Set(["content", "menus", "gallery", "banners"]);

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
