# Deployment Guide — HAR Analyzer

HAR Analyzer is a **client-only** Next.js app: HAR parsing, IndexedDB persistence (v2 hot metadata + cold body blobs), privacy redaction, and all analysis run in the browser. The server only serves static assets and the App Router shell — no upload API, accounts, or server-side storage.

After the **0.2.0** refactor, production deploys are unchanged at a high level (`output: 'standalone'`, copy `public/` + `.next/static/`), but builds are slightly larger (more routes/panels) and the optional HAR parse **Web Worker** ships as part of `.next/static/` (included in the existing static copy step).

## Pre-deploy checklist (recommended)

Run locally or in CI before shipping:

```bash
npm ci
npm test          # Vitest suite (324+ tests)
npm run build     # must succeed with output: 'standalone'
```

Manual smoke after deploy (see [Post-deploy verification](#post-deploy-verification) below):

1. Open `/` — privacy banner (first visit), upload zone, optional redaction toggle
2. Upload a sample HAR — insight strip, Tools row, primary CTA
3. If the capture has cross-origin traffic — `/cors` shows KPIs + **CORS requests** inventory even when findings are zero
4. Open `/entry-diff` — search a pathname (e.g. `/hello`); confirm **Selected path** and multi-host entries. Pick baseline + compare; switch **Headers | Content** tabs (status chips on each tab)
5. **Headers** tab — four section cards in a 2×2 grid; **Content** tab — body diff or **no body** / **binary** badges; no duplicate-key console errors
6. Legacy `/content-diff` and `/header-diff` redirect with `?section=` preserved
7. Open `/mime-mismatch` — mismatch rows; Tools badge count; optional **Show unverified extensions**
8. Open `/cache-validator` — path groups with ETag or Last-Modified drift; **W** / **S** ETag chips; expand entries; Tools badge count; optional **Show paths with no cache validators**
9. Entry detail — when HAR `content.mimeType` is `x-unknown` but `Content-Type` header is real, summary shows split (effective type + amber HAR vs header note); Content Types counts use effective type
10. Open `/anomalies` — hub with four category cards; Tools **Anomalies** badge; drill into `/anomalies/status`, `/size`, `/encoding`, or `/cache-policy`; expand path groups
11. Optional: enable worker parse and upload a ≥ 5 MB HAR (see [Build-time options](#build-time-options))
12. **Security hardening** — with redaction enabled, re-upload or remove a file and confirm response bodies are not available on entry detail; `/kv-search` regex mode shows a timeout warning on pathological patterns; `/compare` does not link `javascript:` URLs

---

## Option A: Docker / Docker Compose

### Prerequisites

- Docker 24+ and Docker Compose v2

### Quick start

```bash
# Clone the repository
git clone https://github.com/hinadome/har_analyzer.git
cd har_analyzer

# Build and run
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

The app is available at **http://localhost:3000**.

### Build image manually

```bash
docker build -t har-analyzer:latest .
docker run -d --name har-analyzer -p 3000:3000 --restart unless-stopped har-analyzer:latest
```

To bake in the optional large-HAR parse worker (≥ 5 MB files) at **build** time:

```bash
docker build \
  --build-arg NEXT_PUBLIC_HAR_PARSE_WORKER=1 \
  -t har-analyzer:latest .
```

Or in `docker-compose.yml`, uncomment / set `build.args` (see file comments).

The Dockerfile copies `public/`, the standalone server tree, and **all of** `.next/static/` into the runtime image. That includes worker chunks emitted under `.next/static/chunks/` and `.next/static/media/` — no separate worker copy step is required.

### Health check

Docker automatically checks `http://localhost:3000/` every 30 s.
Inspect status with:

```bash
docker inspect --format='{{.State.Health.Status}}' har-analyzer
```

### Updating to a new version

```bash
git pull
docker compose build --no-cache
docker compose up -d
```

---

## Option B: VM (Ubuntu / Debian) with PM2

### Prerequisites

- Ubuntu 22.04+ or Debian 11+ VM
- Node.js 22 (installed automatically by the script)
- User with `sudo` privileges
- Outbound internet access (to install Node.js and clone the repo)

### First-time deployment

```bash
# Download and run the script
curl -fsSL https://raw.githubusercontent.com/hinadome/har_analyzer/main/deploy-vm.sh -o deploy-vm.sh
bash deploy-vm.sh
```

The script:

1. Installs Node.js 22 via NodeSource (Maintenance LTS until 2027-04-30; Node.js 20 reached End-of-Life on 2026-04-30. Next.js 16 itself only requires ≥ 20.9, but we track an actively-supported LTS line.)
2. Installs PM2 globally
3. Clones `https://github.com/hinadome/har_analyzer.git` to `~/har_analyzer`
4. Runs `npm ci`, then **`npm test`**, then `npm run build`, then prunes devDependencies
5. Copies `public/` → `.next/standalone/public/` and `.next/static/` → `.next/standalone/.next/static/` (required by Next.js standalone output — same layout as the Dockerfile; **worker assets live under `.next/static/` and are included**)
6. Starts the app under PM2 with entry point `.next/standalone/server.js` and `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0` exported into the process environment
7. Configures PM2 to restart on system reboot via `systemd`

To enable the optional parse worker for all users without per-browser `localStorage`, export before install/update:

```bash
export NEXT_PUBLIC_HAR_PARSE_WORKER=1
bash deploy-vm.sh
```

### Updating

```bash
bash ~/har_analyzer/deploy-vm.sh --update
```

Pulls latest code, rebuilds, and restarts the PM2 process.

### Useful PM2 commands

| Command                    | Description         |
| -------------------------- | ------------------- |
| `pm2 status`               | Show all processes  |
| `pm2 logs har-analyzer`    | Stream logs         |
| `pm2 restart har-analyzer` | Restart the process |
| `pm2 stop har-analyzer`    | Stop the process    |
| `pm2 delete har-analyzer`  | Remove from PM2     |

### Accessing the app

The app listens on **http://localhost:3000**.  
To expose it publicly, configure a reverse proxy (nginx example below).

#### nginx reverse proxy (optional)

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo apt-get install -y nginx
sudo nano /etc/nginx/sites-available/har-analyzer  # paste config above
sudo ln -s /etc/nginx/sites-available/har-analyzer /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## Environment variables

### Runtime (server)

| Variable   | Default      | Description                     |
| ---------- | ------------ | ------------------------------- |
| `PORT`     | `3000`       | HTTP port the server listens on |
| `HOSTNAME` | `0.0.0.0`    | Bind address                    |
| `NODE_ENV` | `production` | Runtime environment             |

Set custom values in `docker-compose.yml` (Docker) or via PM2 ecosystem file (VM).

### Build-time options

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `NEXT_PUBLIC_HAR_PARSE_WORKER` | unset (`0`) | When set to `1` at **build** time, enables the Web Worker parse path for HAR files ≥ 5 MB. Users can also opt in per browser with `localStorage.setItem('har_parse_worker', '1')`. Main-thread parsing remains the fallback if the worker fails to load. |

No server env vars are required for IndexedDB v2, privacy banner, or credential redaction — those are entirely client-side.

### Anomaly detection thresholds (client-side)

Pathname grouping ignores query strings (same as entry diff). Constants are defined in `utils/anomalies/analyze.ts` and are not configurable at deploy time.

| Check | Flag when |
| ----- | --------- |
| Status | ≥2 entries on pathname, distinct status codes |
| Size drift | ≥2 entries with `content.size` > 0, and **max/min ≥ 2** or **max − min ≥ 10 KB** |
| Encoding drift | ≥2 entries on pathname, distinct `Content-Encoding` (missing = identity) |
| Large uncompressed | ≥1 entry: compressible type, no `Content-Encoding`, `content.size` ≥ **50 KB** |
| Cache policy | ≥2 entries on pathname, >1 distinct `Cache-Control` or >1 distinct `Vary` (among entries that send each header) |

---

## Post-deploy verification

After Docker or VM deploy, confirm the **0.2.0** UI and assets load correctly:

| Check | What to expect |
| ----- | -------------- |
| Home `/` | Upload zone; dismissible **HARs can contain credentials** banner on first visit; **Redact credentials before saving** checkbox (off by default; omits response bodies from IndexedDB when enabled) |
| Upload | Progress line shows file name while parsing; data persists across refresh (IndexedDB v2) |
| Insight strip | Request/error/size totals; **Tools** row (CORS, MIME mismatch, Cache validator, Anomalies badges); comparison table behind **Full metrics table** |
| CORS `/cors` | Page title **CORS** (not "CORS Audit"); when cross-origin traffic exists but audit is clean, **CORS requests** table lists entries (not an empty dead-end) |
| Entry diff `/entry-diff` | Search a pathname; **Selected path** banner; unified entry table. **Headers | Content** tabs with status chips. Headers: 2×2 section cards. Content: body diff or **no body** / **binary** badges. Bodies load only on Content tab. No duplicate-key console errors |
| Legacy redirects | `/content-diff` → `?section=content`; `/header-diff` → `?section=headers` |
| MIME mismatch `/mime-mismatch` | Mismatch table (effective Content-Type); insight strip card when mismatches exist; **Show unverified extensions** off by default; Tools badge count |
| Cache validator `/cache-validator` | Pathname groups with ETag or Last-Modified drift; weak (**W**, dashed) vs strong (**S**) ETag chips; expandable entry list; insight strip + Tools badge; **no-validator** paths toggle |
| Anomalies `/anomalies` | Hub + four categories (status, size, encoding, cache-policy); unique-path Tools badge; correlation strip for multi-check paths; expandable entry lists; see [thresholds table](#anomaly-detection-thresholds-client-side) |
| Content-Type resolution | Entry detail split when HAR MIME is junk (`x-unknown`) but header is real; **from header** / **≠ HAR** chips in list tables; Content Types counts use effective type |
| Security hardening | `?expand=` capped at 512 chars; kv-search regex timeout on pathological patterns; `/compare` external URL link only for `http:` / `https:` |
| Static assets | No 404s for `/_next/static/chunks/*` in browser devtools (if chunks 404, the standalone static copy step was skipped or the dest path was wrong — must be `.next/standalone/.next/static/`) |
| Worker (optional) | With worker enabled, upload a large HAR — parse completes; if worker chunk 404s, app falls back to main-thread parse (check console) |

Sample files in `sample-hars/` are suitable for smoke tests. Use **`fixture-audits.har`** for deterministic audit triggers (MIME, cache validator, anomalies, Content-Type split) — see `sample-hars/README.md`. General samples (`sample-a` … `sample-c`) are clean traffic for pair diff; they do not trigger audit findings. Worker path will not activate on these small files unless you use a multi-MB capture.

### Node.js and build warnings

- Production Docker/VM images use **Node 22 LTS** (see `Dockerfile`, `deploy-vm.sh`).
- Local dev on **Node 26+** requires Tailwind **≥ 4.3.1** to avoid `DEP0205` (`module.register()` deprecated). This repo pins `tailwindcss@^4.3.3`.
- If you see the warning after `npm ci`, run `npm ls tailwindcss @tailwindcss/node` and confirm 4.3.1+.

---

## What did **not** change for ops

- Still **standalone** output only — no `output: 'export'` / static hosting without Node.
- No database, Redis, or backend secrets to configure.
- **Clear all** / IndexedDB data stays in each user's browser; redeploying the server does not wipe user HAR data (nor migrate it — legacy v1 blobs migrate client-side on load).
- Reverse-proxy and TLS setup unchanged (nginx example below still applies).
