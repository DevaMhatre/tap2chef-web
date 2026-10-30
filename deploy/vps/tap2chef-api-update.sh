#!/usr/bin/env bash
# Installs the newest Tap2Chef API from GitHub's `api` branch, if there is
# one, and restarts it under pm2. Runs every 5 minutes from cron; does
# nothing when already current. If the new version doesn't answer its health
# check, the previous one is put back.
set -Eeuo pipefail
REPO=https://github.com/DevaMhatre/tap2chef-web
ROOT=${ROOT:-}
DIR=${DIR:-$ROOT/var/www/tap2chef-api}
ENV_FILE=${ENV_FILE:-$ROOT/etc/tap2chef-api.env}
NAME=tap2chef-api
HEALTH=${HEALTH:-http://127.0.0.1:8100/api/health}

# cron starts with a bare PATH; node, npm and pm2 come from nvm.
export NVM_DIR=${NVM_DIR:-/root/.nvm}
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null
fi

latest=$(git ls-remote "$REPO.git" refs/heads/api | cut -f1)
if [ -z "$latest" ]; then
  exit 0
fi
if [ "$(cat "$DIR/.deployed" 2>/dev/null)" = "$latest" ]; then
  exit 0
fi

rm -rf "$DIR.new"
mkdir -p "$DIR.new"
curl -fsSL "$REPO/archive/$latest.tar.gz" | tar -xz -C "$DIR.new" --strip-components=1
if [ -f "$DIR.new/index.html" ] || [ ! -f "$DIR.new/index.js" ]; then
  echo "${latest:0:7} doesn't look like the API; nothing changed" >&2
  rm -rf "$DIR.new"
  exit 1
fi
(cd "$DIR.new" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
ln -sf "$ENV_FILE" "$DIR.new/.env"
echo "$latest" > "$DIR.new/.deployed"

healthy() {
  for _ in $(seq 1 20); do
    curl -fsS "$HEALTH" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

start() {
  if pm2 describe "$NAME" >/dev/null 2>&1; then
    pm2 restart "$NAME" --update-env >/dev/null
  else
    pm2 start "$DIR/index.js" --name "$NAME" --cwd "$DIR" >/dev/null
  fi
}

rm -rf "$DIR.old"
if [ -d "$DIR" ]; then mv "$DIR" "$DIR.old"; fi
mv "$DIR.new" "$DIR"
start

if ! healthy; then
  echo "$(date '+%F %T') ${latest:0:7} didn't answer; putting the previous version back" >&2
  rm -rf "$DIR.failed"
  mv "$DIR" "$DIR.failed"
  if [ -d "$DIR.old" ]; then
    mv "$DIR.old" "$DIR"
    start
  else
    pm2 delete "$NAME" >/dev/null 2>&1 || true
  fi
  exit 1
fi

pm2 save >/dev/null
echo "$(date '+%F %T') deployed api ${latest:0:7}"
