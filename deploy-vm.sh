#!/bin/bash
# deploy-vm.sh — Deploy HAR Analyzer on a Linux VM (Ubuntu/Debian)
# Usage: bash deploy-vm.sh [--update]
#
# Prerequisites: run as a user with sudo privileges
# First-time: installs Node.js 22, PM2, clones repo, builds, starts service
# --update:    pulls latest code, rebuilds, and restarts service

set -euo pipefail

REPO_URL="https://github.com/hinadome/har_analyzer.git"
APP_DIR="$HOME/har_analyzer"
APP_NAME="har-analyzer"
# Node.js 22 (Maintenance LTS until 2027-04-30). Node 20 reached EOL on
# 2026-04-30; Next.js 16 itself only requires >= 20.9, but we track an
# actively-supported LTS line.
NODE_VERSION="22"
PORT=3000

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Update mode ──────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--update" ]]; then
  info "Updating HAR Analyzer..."
  cd "$APP_DIR" || error "App directory not found: $APP_DIR. Run without --update for fresh install."

  info "Pulling latest code..."
  git pull origin main

  info "Installing dependencies..."
  npm ci

  info "Running tests..."
  npm test

  info "Building application..."
  npm run build

  info "Pruning dev dependencies..."
  npm prune --omit=dev

  # Next.js standalone output does not bundle public/ or .next/static/
  # automatically; copy them into the standalone tree so server.js can serve them.
  # Dest path must be …/.next/static (same as Dockerfile), not …/.next/.
  # Worker chunks (harParse.worker) live under .next/static and are included here.
  info "Copying static assets into standalone bundle..."
  mkdir -p .next/standalone/.next
  rm -rf .next/standalone/public .next/standalone/.next/static
  cp -r public .next/standalone/public
  cp -r .next/static .next/standalone/.next/static

  info "Restarting service..."
  export NODE_ENV=production PORT="$PORT" HOSTNAME=0.0.0.0
  pm2 restart "$APP_NAME" --update-env || pm2 start .next/standalone/server.js \
    --name "$APP_NAME"

  pm2 save
  info "Update complete. App running at http://localhost:${PORT}"
  echo ""
  echo "  Smoke test: upload a HAR at /, open /cors if cross-origin traffic exists."
  echo "  Entry diff:   /entry-diff — Headers | Content tabs; pathname selection; body badges."
  echo "  Legacy:       /content-diff → ?section=content; /header-diff → ?section=headers"
  echo "  MIME:         /mime-mismatch — extension vs effective Content-Type; unverified toggle."
  echo "  Cache:        /cache-validator — ETag / Last-Modified drift; W vs S chips; expand entries."
  echo "  Anomalies:    /anomalies — status, size (2x/10KB), encoding, cache-policy; hub + categories."
  echo "  Fixture:      upload sample-hars/fixture-audits.har for deterministic audit smoke."
  echo "  Content-Type: entry detail split when HAR mime is x-unknown but header is real."
  echo "  Security:     redact toggle omits response bodies; /compare links http(s) only;"
  echo "                kv-search regex has CPU budget; ?expand= capped at 512 chars."
  echo "  Build:        Tailwind 4.3.3+ avoids DEP0205 on Node 26; VM uses Node ${NODE_VERSION}."
  echo "  Optional worker: export NEXT_PUBLIC_HAR_PARSE_WORKER=1 before rebuild."
  exit 0
fi

# ── First-time install ────────────────────────────────────────────────────────
info "Starting HAR Analyzer first-time installation..."

# 1. System packages
info "Updating system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq git curl wget

# 2. Node.js
if command -v node &>/dev/null && [[ "$(node --version)" == v${NODE_VERSION}.* ]]; then
  info "Node.js $(node --version) already installed."
else
  info "Installing Node.js ${NODE_VERSION}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
info "Node.js $(node --version) | npm $(npm --version)"

# 3. PM2
if command -v pm2 &>/dev/null; then
  info "PM2 $(pm2 --version) already installed."
else
  info "Installing PM2..."
  sudo npm install -g pm2 --quiet
fi

# 4. Clone repository
if [[ -d "$APP_DIR" ]]; then
  warn "Directory $APP_DIR already exists. Pulling latest changes..."
  cd "$APP_DIR"
  git pull origin main
else
  info "Cloning repository..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# 5. Install dependencies
info "Installing dependencies..."
npm ci

# 5a. Test (requires devDependencies — run before prune)
info "Running tests..."
npm test

# 6. Build (honours NEXT_PUBLIC_HAR_PARSE_WORKER if exported in the environment)
info "Building application (this may take a minute)..."
npm run build

# 6a. Prune dev dependencies after build
info "Pruning dev dependencies..."
npm prune --omit=dev

# 6b. Copy static assets into the standalone bundle.
# Next.js' standalone output ships a minimal server.js + traced node_modules
# but intentionally does not copy public/ or .next/static/ — they are expected
# to be served by a CDN, or copied in manually (per the Next.js docs).
# Dest path must be …/.next/static (same as Dockerfile), not …/.next/.
# Worker assets (optional large-HAR parse) are under .next/static and included.
info "Copying static assets into standalone bundle..."
mkdir -p .next/standalone/.next
rm -rf .next/standalone/public .next/standalone/.next/static
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static

# 7. Start with PM2.
# server.js reads PORT and HOSTNAME from the environment, not argv, so we
# export them before invoking pm2 rather than passing flags after `--`.
info "Starting application with PM2..."
pm2 delete "$APP_NAME" 2>/dev/null || true
export NODE_ENV=production PORT="$PORT" HOSTNAME=0.0.0.0
pm2 start .next/standalone/server.js --name "$APP_NAME"

# 8. Persist PM2 across reboots
info "Configuring PM2 to start on boot..."
pm2 save
# Generate and apply the startup command for the current user
PM2_STARTUP_CMD=$(pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null | grep "sudo" | head -1)
if [[ -n "$PM2_STARTUP_CMD" ]]; then
  eval "$PM2_STARTUP_CMD"
else
  warn "Could not auto-configure startup. Run 'pm2 startup' manually and follow the instructions."
fi

# 9. Health check
info "Waiting for app to start..."
sleep 3
if wget -qO- "http://localhost:${PORT}/" &>/dev/null; then
  info "Health check passed."
else
  warn "Health check failed — app may still be starting. Check logs: pm2 logs ${APP_NAME}"
fi

echo ""
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo "  URL:    http://localhost:${PORT}"
echo "  Logs:   pm2 logs ${APP_NAME}"
echo "  Status: pm2 status"
echo "  Update: bash $APP_DIR/deploy-vm.sh --update"
echo ""
echo "  Smoke test: open /, upload a HAR, check insight strip + Tools row."
echo "  CORS:       /cors should list cross-origin requests even when audit is clean."
echo "  Entry diff: /entry-diff — Headers | Content tabs; lazy body load on Content tab."
echo "  Legacy:     /content-diff → ?section=content; /header-diff → ?section=headers"
echo "  MIME:       /mime-mismatch — extension vs effective Content-Type; unverified toggle."
echo "  Cache:      /cache-validator — ETag / Last-Modified drift; W vs S chips; expand entries."
echo "  Anomalies:  /anomalies — status, size (2x/10KB), encoding, cache-policy; hub + categories."
echo "  Fixture:    upload sample-hars/fixture-audits.har for deterministic audit smoke."
echo "  Content-Type: entry detail split when HAR mime is x-unknown but header is real."
echo "  Security:   redact toggle omits response bodies; /compare links http(s) only;"
echo "              kv-search regex has CPU budget; ?expand= capped at 512 chars."
echo "  Build:      Tailwind 4.3.3+ avoids DEP0205 on Node 26; VM uses Node ${NODE_VERSION}."
echo "  Worker:     export NEXT_PUBLIC_HAR_PARSE_WORKER=1 && bash $APP_DIR/deploy-vm.sh --update"
echo "  See DEPLOYMENT.md for full post-deploy verification checklist."
