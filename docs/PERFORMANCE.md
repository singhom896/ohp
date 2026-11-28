# Performance setup (run once per machine)

After copying the project to a new machine / folder:

```powershell
# from the project root
powershell -ExecutionPolicy Bypass -File tools\setup-performance.ps1
# then restart Apache (XAMPP Control Panel -> Apache -> Stop, Start)

cd frontend
npm run dev        # dev server + background pre-compile of the public pages
```

| What | Why | Effect |
|---|---|---|
| PHP OPcache on (`php.ini`) | Without it PHP recompiles every Laravel / vendor file on each request | API call ~300 ms -> ~40 ms |
| `opcache.validate_timestamps=1`, `revalidate_freq=1` | Edited PHP files are picked up | Changes apply within 1 s, no restart |
| No `config:cache` / `route:cache` in development | Cached config ignores `.env` edits, cached routes ignore route edits | Changes always apply |
| Optimized Composer autoloader | Fewer file lookups per request | Small gain |
| `npm run dev` warm-up (`frontend/scripts/dev.mjs`) | `next dev` compiles a page on its first visit (8-10 s on Windows) | First visit 8-10 s -> ~0.3 s |

Optional (Administrator PowerShell, trusted machine only):
`tools\setup-performance.ps1 -DefenderExclusions` excludes the project folder from
Windows Defender real-time scanning, which makes `npm install` and Next.js compiles much faster.

Other commands: `npm run dev:plain` (plain `next dev`), `npm run warmup` (pre-compile
against a dev server that is already running), `OHP_NO_WARMUP=1` to skip the warm-up.

Fast mode: `npm run fast` (frontend) builds the production version (only when code
changed since the last build) and serves it - every page opens instantly, but there is
no hot reload: after a frontend edit, Ctrl+C and `npm run fast` again (it rebuilds).
`npm run fast -- --rebuild` forces a rebuild. Backend edits still apply immediately.

Full production: `next build && next start` (frontend) and `php artisan optimize` (backend)
are much faster again, but then code / `.env` edits need a rebuild / re-cache.
