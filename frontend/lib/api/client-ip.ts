// SERVER-ONLY: the visitor's IP address, to pass on to Laravel.
//
// Every browser request reaches Laravel through this Next.js server, so without
// this Laravel sees one IP (the Next.js server) for all visitors, and its
// per-IP limits (captcha, login, register, forgot password ...) are shared by
// everyone on the site. backendFetch({ clientIp }) sends this value as
// X-Forwarded-For; Laravel trusts that header only from the Next.js server
// (TRUSTED_PROXIES in the backend .env).
//
// The RIGHTMOST X-Forwarded-For entry is used: it is the one added by the
// closest proxy (nginx / IIS in production, or Next.js itself when nothing
// sits in front). Entries to its left can be typed by anyone.

const IP_RE = /^[0-9a-fA-F:.]{2,45}$/;

export function clientIp(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  const ip = (last || headers.get("x-real-ip") || "").replace(/^\[|\]$/g, "").replace(/^::ffff:/, "");
  return IP_RE.test(ip) ? ip : undefined;
}
