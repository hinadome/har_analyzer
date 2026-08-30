# Deployment Guide — HAR Analyzer

HAR Analyzer is a **client-only** Next.js app: HAR parsing, IndexedDB persistence (v2 hot metadata + cold body blobs), privacy redaction, and all analysis run in the browser. The server only serves static assets and the App Router shell — no upload API, accounts, or server-side storage.

After the **0.2.0** refactor, production deploys are unchanged at a high level (`output: 'standalone'`, copy `public/` + `.next/static/`), but builds are slightly larger (more routes/panels) and the optional HAR parse **Web Worker** ships as part of `.next/static/` (included in the existing static copy step).

## Pre-deploy checklist (recommended)

Run locally or in CI before shipping:

```bash
npm ci
npm test          # Vitest suite (239+ tests)
npm run build     # must succeed with output: 'standalone'
```

Manual smoke after deploy (see [Post-deploy verification](#post-deploy-verification) below):

1. Open `/` — privacy banner (first visit), upload zone, optional redaction toggle
2. Upload a sample HAR — insight strip, Tools row, primary CTA
3. If the capture has cross-origin traffic — `/cors` shows KPIs + **CORS requests** inventory even when findings are zero
4. Optional: enable worker parse and upload a ≥ 5 MB HAR (see [Build-time options](#build-time-options))

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
5. Copies `public/` and `.next/static/` into `.next/standalone/` (required by Next.js standalone output — these directories are not bundled into `server.js` automatically; **worker assets live under `.next/static/` and are included**)
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

---

## Post-deploy verification

After Docker or VM deploy, confirm the **0.2.0** UI and assets load correctly:

| Check | What to expect |
| ----- | -------------- |
| Home `/` | Upload zone; dismissible **HARs can contain credentials** banner on first visit; **Redact credentials before saving** checkbox (off by default) |
| Upload | Progress line shows file name while parsing; data persists across refresh (IndexedDB v2) |
| Insight strip | Request/error/size totals; **Tools** row; comparison table behind **Full metrics table** |
| CORS `/cors` | Page title **CORS** (not "CORS Audit"); when cross-origin traffic exists but audit is clean, **CORS requests** table lists entries (not an empty dead-end) |
| Static assets | No 404s for `/_next/static/chunks/*` in browser devtools (if chunks 404, the standalone static copy step was skipped) |
| Worker (optional) | With worker enabled, upload a large HAR — parse completes; if worker chunk 404s, app falls back to main-thread parse (check console) |

Sample files in `sample-hars/` are suitable for a quick smoke test; they are small, so the worker path will not activate unless you use a multi-MB capture.

---

## What did **not** change for ops

- Still **standalone** output only — no `output: 'export'` / static hosting without Node.
- No database, Redis, or backend secrets to configure.
- **Clear all** / IndexedDB data stays in each user's browser; redeploying the server does not wipe user HAR data (nor migrate it — legacy v1 blobs migrate client-side on load).
- Reverse-proxy and TLS setup unchanged (nginx example below still applies).
