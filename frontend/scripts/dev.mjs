// `npm run dev`: starts `next dev` (hot reload, edits apply immediately) and then
// pre-compiles the public pages in the background, so the first visit to a page
// does not wait for Turbopack to compile it (8-10 s per page on Windows).
//
//   npm run dev                 dev server + warm-up
//   npm run dev -- -p 3001      any `next dev` argument is passed through
//   OHP_NO_WARMUP=1 npm run dev skip the warm-up
//   npm run dev:plain           plain `next dev`
//   npm run warmup              only pre-compile (dev server already running)
//
// Pages under app/(dashboard) and app/(moc) are not warmed: without a session
// proxy.ts redirects them to /login before they compile. They share one console
// bundle, so after the first dashboard page the others compile quickly.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const portFlag = args.findIndex((a) => a === "-p" || a === "--port");
const port = (portFlag >= 0 ? args[portFlag + 1] : null) ?? process.env.PORT ?? "3000";
const base = `http://localhost:${port}`;

// `npm run warmup` (--warmup-only): only pre-compile, against a dev server that is already running.
const warmOnly = args.includes("--warmup-only");
if (!warmOnly) {
  const next = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev", ...args], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  next.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => next.kill(sig));
}

/** Static page routes of the public site (route groups stripped, dynamic segments skipped). */
function publicRoutes(dir = path.join(root, "app"), url = "", out = new Set()) {
  if (["page.tsx", "page.ts", "page.jsx", "page.js"].some((f) => existsSync(path.join(dir, f)))) out.add(url || "/");
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const n = e.name;
    if (n === "api" || n === "(dashboard)" || n === "(moc)" || n.startsWith("[") || n.startsWith("@") || n.startsWith("_")) continue;
    publicRoutes(path.join(dir, n), /^\(.*\)$/.test(n) ? url : `${url}/${n}`, out);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { "x-ohp-warmup": "1" } });
    await res.arrayBuffer();
    return res.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(t);
  }
}

async function warmUp() {
  if (process.env.OHP_NO_WARMUP) return;
  // Wait for the server to accept connections (the first request compiles "/").
  const start = Date.now();
  while (Date.now() - start < 180_000) {
    if ((await get(`${base}/login`, 120_000)) > 0) break;
    await sleep(1000);
  }
  const routes = [...publicRoutes(), "/content/about-us"].filter((r) => r !== "/login");
  const t0 = Date.now();
  let ok = 0;
  for (const r of routes) {
    // One at a time: keeps the machine responsive while you work.
    if ((await get(base + r, 120_000)) > 0) ok++;
  }
  console.log(`\n  [warm-up] ${ok}/${routes.length} public pages pre-compiled in ${Math.round((Date.now() - t0) / 1000)}s\n`);
}

warmUp().catch(() => {});
