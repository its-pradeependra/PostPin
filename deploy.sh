#!/bin/bash
set -euo pipefail

# ═════════════════════════════════════════════════════════════════════════════
# Postpin — redeploy script (run on the VPS from the repo root)
#
#   ./deploy.sh              pull + rebuild + restart BOTH apps (with health checks)
#   ./deploy.sh frontend     only Postpin-F
#   ./deploy.sh backend      only Postpin-S
#
# Keep these ports in sync with ecosystem.config.js and the nginx confs.
# ═════════════════════════════════════════════════════════════════════════════
FRONTEND_PORT=3000
BACKEND_PORT=4000

GREEN='\033[1;32m'
RED='\033[1;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

TARGET="${1:-all}"
case "$TARGET" in all|frontend|backend) ;; *)
  echo -e "${RED}Usage: ./deploy.sh [all|frontend|backend]${NC}"; exit 1 ;;
esac

clear

# ================= MAIN BANNER - POSTPIN =================
echo -e "${GREEN}"
echo "██████╗  ██████╗ ███████╗████████╗██████╗ ██╗███╗   ██╗"
echo "██╔══██╗██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██║████╗  ██║"
echo "██████╔╝██║   ██║███████╗   ██║   ██████╔╝██║██╔██╗ ██║"
echo "██╔═══╝ ██║   ██║╚════██║   ██║   ██╔═══╝ ██║██║╚██╗██║"
echo "██║     ╚██████╔╝███████║   ██║   ██║     ██║██║ ╚████║"
echo "╚═╝      ╚═════╝ ╚══════╝   ╚═╝   ╚═╝     ╚═╝╚═╝  ╚═══╝"
echo ""
echo "        >>> POSTPIN DEPLOYMENT STARTED (${TARGET}) <<<"
echo -e "${NC}"

STARTED_AT=$(date +%s)
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# Restart the PM2 app if it exists, otherwise start it from the ecosystem file.
restart_or_start() { # $1 = pm2 app name
  if pm2 describe "$1" >/dev/null 2>&1; then
    pm2 restart "$1" --update-env
  else
    echo -e "${YELLOW}[!] $1 not found in pm2 — starting from ecosystem.config.js${NC}"
    pm2 start "$PROJECT_DIR/ecosystem.config.js" --only "$1"
  fi
}

# pnpm install: reproducible when the lockfile exists, plain install before
# pnpm-lock.yaml has been committed for the first time.
pnpm_install() {
  if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi
}

# ================= PULL LATEST CODE =================
echo -e "${GREEN}[+] Pulling latest code...${NC}"
git pull --ff-only

# ================= FRONTEND =================
if [ "$TARGET" != "backend" ]; then
  echo -e "${GREEN}"
  echo "███████╗██████╗  ██████╗ ███╗   ██╗████████╗███████╗███╗   ██╗██████╗ "
  echo "██╔════╝██╔══██╗██╔═══██╗████╗  ██║╚══██╔══╝██╔════╝████╗  ██║██╔══██╗"
  echo "█████╗  ██████╔╝██║   ██║██╔██╗ ██║   ██║   █████╗  ██╔██╗ ██║██║  ██║"
  echo "██╔══╝  ██╔══██╗██║   ██║██║╚██╗██║   ██║   ██╔══╝  ██║╚██╗██║██║  ██║"
  echo "██║     ██║  ██║╚██████╔╝██║ ╚████║   ██║   ███████╗██║ ╚████║██████╔╝"
  echo "╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═══╝╚═════╝ "
  echo -e "${NC}"

  cd "$PROJECT_DIR/frontend"
  pnpm_install
  # NEXT_PUBLIC_API_URL is baked in HERE (frontend/.env.local) — not at runtime.
  pnpm build
  restart_or_start Postpin-F
fi

# ================= BACKEND =================
if [ "$TARGET" != "frontend" ]; then
  echo -e "${GREEN}"
  echo "██████╗  █████╗  ██████╗██╗  ██╗███████╗███╗   ██╗██████╗ "
  echo "██╔══██╗██╔══██╗██╔════╝██║ ██╔╝██╔════╝████╗  ██║██╔══██╗"
  echo "██████╔╝███████║██║     █████╔╝ █████╗  ██╔██╗ ██║██║  ██║"
  echo "██╔══██╗██╔══██║██║     ██╔═██╗ ██╔══╝  ██║╚██╗██║██║  ██║"
  echo "██████╔╝██║  ██║╚██████╗██║  ██╗███████╗██║ ╚████║██████╔╝"
  echo "╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═════╝ "
  echo -e "${NC}"

  cd "$PROJECT_DIR/server"
  pnpm_install
  # No build step: the API runs via tsx (tsc does not rewrite @/ aliases).
  restart_or_start Postpin-S
fi

# ================= HEALTH CHECKS =================
echo -e "${GREEN}[+] Waiting for services to come up healthy...${NC}"

wait_for() { # $1 = label, $2 = url, $3 = required substring ("" = any 200)
  local i
  for i in $(seq 1 30); do
    local body
    if body=$(curl -fsS --max-time 3 "$2" 2>/dev/null); then
      if [ -z "$3" ] || echo "$body" | grep -q "$3"; then
        echo -e "${GREEN}    ✔ $1 is healthy${NC}"
        return 0
      fi
    fi
    sleep 2
  done
  echo -e "${RED}    ✘ $1 FAILED its health check ($2)${NC}"
  return 1
}

FAILED=0
if [ "$TARGET" != "frontend" ]; then
  # db":"connected proves Mongo is reachable, not just that the process is up.
  wait_for "API (Postpin-S)" "http://127.0.0.1:${BACKEND_PORT}/health" '"db":"connected"' \
    || { pm2 logs Postpin-S --lines 25 --nostream; FAILED=1; }
fi
if [ "$TARGET" != "backend" ]; then
  wait_for "Web (Postpin-F)" "http://127.0.0.1:${FRONTEND_PORT}/" "" \
    || { pm2 logs Postpin-F --lines 25 --nostream; FAILED=1; }
fi

if [ "$FAILED" -ne 0 ]; then
  echo -e "${RED}"
  echo "        >>> DEPLOYMENT FAILED — see pm2 logs above <<<"
  echo -e "${NC}"
  exit 1
fi

pm2 save >/dev/null

# ================= LIVE =================
ELAPSED=$(( $(date +%s) - STARTED_AT ))
echo -e "${GREEN}"
echo "██╗     ██╗██╗   ██╗███████╗"
echo "██║     ██║██║   ██║██╔════╝"
echo "██║     ██║██║   ██║█████╗  "
echo "██║     ██║╚██╗ ██╔╝██╔══╝  "
echo "███████╗██║ ╚████╔╝ ███████╗"
echo "╚══════╝╚═╝  ╚═══╝  ╚══════╝"
echo ""
echo "        >>> DEPLOYMENT COMPLETE in ${ELAPSED}s <<<"
echo "        web  → https://postpin.creatibyte.in"
echo "        api  → https://api.postpin.creatibyte.in/health"
echo -e "${NC}"
