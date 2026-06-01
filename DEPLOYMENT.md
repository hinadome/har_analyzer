# Deployment Guide — HAR Analyzer

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
4. Runs `npm ci && npm run build`, then prunes devDependencies
5. Copies `public/` and `.next/static/` into `.next/standalone/` (required by Next.js standalone output — these directories are not bundled into `server.js` automatically)
6. Starts the app under PM2 with entry point `.next/standalone/server.js` and `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0` exported into the process environment
7. Configures PM2 to restart on system reboot via `systemd`

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

| Variable   | Default      | Description                     |
| ---------- | ------------ | ------------------------------- |
| `PORT`     | `3000`       | HTTP port the server listens on |
| `HOSTNAME` | `0.0.0.0`    | Bind address                    |
| `NODE_ENV` | `production` | Runtime environment             |

Set custom values in `docker-compose.yml` (Docker) or via PM2 ecosystem file (VM).
