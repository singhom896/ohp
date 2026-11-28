// `npm run fast`: production mode. Every page is pre-built, so pages open in well
// under a second instead of compiling on first visit like `next dev`.
//
//   npm run fast                build (only if code changed since the last build) + start
//   npm run fast -- --rebuild   always rebuild first
//   npm run fast -- -p 3001     other port (default 3000, or $PORT)
//
// Trade-off: no hot reload. After editing frontend code, stop it (Ctrl+C) and run
// `npm run fast` again - it notices the change and rebuilds. Use `npm run dev` while
// actively editing. Backend (Laravel) edits still apply immediately in both modes.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const args = process.argv.slice(2);
const forceRebuild = args.includes("--rebuild");
const startArgs = args.filter((a) => a !== "--rebuild");
const portFlag = startArgs.findIndex((a) => a === "-p" || a === "--port");
const port = Number((portFlag >= 0 ? startArgs[portFlag + 1] : null) ?? process.env.PORT ?? 3000);

// Inputs of the build: when any is newer than the last build, rebuild.
const SOURCES = ["app", "components", "lib", "styles", "public", "hooks", "context", "types", "proxy.ts", "middleware.ts",
  "next.config.ts", "next.config.mjs", "next.config.js", "package.json", "tsconfig.json", ".env", ".env.local", ".env.production", ".env.production.local"];
const SKIP = new Set(["node_modules", ".next", ".git"]);

function newestMtime(p) {
  if (!existsSync(p)) return 0;
  const s = statSync(p);
  if (!s.isDirectory()) return s.mtimeMs;
  let max = s.mtimeMs; // catches deleted / renamed files
  for (const e of readdirSync(p, { withFileTypes: true })) {
    if (!SKIP.has(e.name)) max = Math.max(max, newestMtime(path.join(p, e.name)));
  }
  return max;
}

function needsBuild() {
  const buildId = path.join(root, ".next", "BUILD_ID");
  if (forceRebuild || !existsSync(buildId)) return true;
  const built = statSync(buildId).mtimeMs;
  return SOURCES.some((s) => newestMtime(path.join(root, s)) > built);
}

function portInUse(p) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(true));
    srv.once("listening", () => srv.close(() => resolve(false)));
    srv.listen(p);
  });
}

if (await portInUse(port)) {
  console.error(`\n  Port ${port} is already in use (is \`npm run dev\` still running?).`);
  console.error(`  Stop it with Ctrl+C in that terminal, or use another port: npm run fast -- -p ${port + 1}\n`);
  process.exit(1);
}

if (needsBuild()) {
  console.log("\n  [fast] Code changed since the last build - building (takes a few minutes on this machine)...\n");
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [nextBin, "build"], { cwd: root, stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error("\n  [fast] Build failed - fix the error above, or use `npm run dev`.\n");
    process.exit(r.status ?? 1);
  }
  console.log(`\n  [fast] Built in ${Math.round((Date.now() - t0) / 1000)}s\n`);
} else {
  console.log("\n  [fast] No code changes since the last build - starting immediately.\n");
}

const server = spawn(process.execPath, [nextBin, "start", ...startArgs], { cwd: root, stdio: "inherit", env: process.env });
server.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));
