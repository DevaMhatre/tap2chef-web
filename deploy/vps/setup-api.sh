#!/usr/bin/env bash
# One-time setup of the Tap2Chef API on the VPS. Safe to run again: each step
# checks before it changes anything. Run as root:
#
#   bash setup-api.sh
#
# What it does:
#   1. Makes /etc/tap2chef-api.env (mode 600) with a fresh JWT secret, and
#      stops until you have filled in the database password and the Resend key.
#   2. Adds `location /api/` to the tap2chef nginx site, proxying to
#      127.0.0.1:8100. Backs the file up first; if `nginx -t` fails, puts it back.
#   3. Installs the API updater and its cron entry (every 5 minutes, its own
#      log), and runs it once.
#
# It never touches the POS, the portfolio, the site updater or certbot's lines.
set -Eeuo pipefail

ROOT=${ROOT:-}
ENV_FILE=$ROOT/etc/tap2chef-api.env
SITE=$ROOT/etc/nginx/sites-enabled/tap2chef.devamhatre.com
UPDATER=$ROOT/root/tap2chef-api-update.sh
CRON=$ROOT/etc/cron.d/tap2chef-api
LOG=/var/log/tap2chef-api-deploy.log
HERE=$(cd "$(dirname "$0")" && pwd)
STAMP=$(date '+%Y%m%d-%H%M%S')
BACKUP=$ROOT/root/tap2chef-backup-$STAMP

say() { printf '\n== %s\n' "$*"; }

if [ -z "$ROOT" ] && [ "$(id -u)" != 0 ]; then
  echo "Run as root." >&2
  exit 1
fi
if [ ! -f "$SITE" ]; then
  echo "Can't find $SITE" >&2
  exit 1
fi
if [ ! -f "$HERE/tap2chef-api-update.sh" ]; then
  echo "Keep this script next to tap2chef-api-update.sh" >&2
  exit 1
fi

# ---------------------------------------------------------------- 1. secrets
say "1/3 Secrets: $ENV_FILE"
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
PORT=8100
HOST=127.0.0.1
CLIENT_URL=https://tap2chef.devamhatre.com
JWT_SECRET=$(openssl rand -hex 32)
MONGO_URL=mongodb+srv://DevaMhatre:PASSWORD@cluster0.39eylgc.mongodb.net/tap2chef?retryWrites=true&w=majority
RESEND_API_KEY=
MAIL_FROM="Tap2Chef <codes@devamhatre.com>"
ENV
  chmod 600 "$ENV_FILE"
  echo "Made it. Fill in PASSWORD in MONGO_URL and RESEND_API_KEY, then run this script again."
fi
missing=$(grep -E '^(MONGO_URL=.*PASSWORD|RESEND_API_KEY=$)' "$ENV_FILE" || true)
if [ -n "$missing" ]; then
  echo "Still to fill in, in $ENV_FILE:"
  echo "$missing" | sed -E 's/=.*/=…/; s/^/  /'
  exit 2
fi
echo "Filled in."

# ---------------------------------------------------------------- 2. nginx
say "2/3 nginx: /api/ → 127.0.0.1:8100"
if grep -q 'location /api/' "$SITE"; then
  echo "Already there."
else
  mkdir -p "$BACKUP"
  cp -p "$SITE" "$BACKUP/"
  echo "Backed up to $BACKUP"
  # Into the https server block, right after the /assets/ line, which only it has.
  awk '
    { print }
    /location \/assets\// && !done {
      print ""
      print "    # The API runs on this machine only (127.0.0.1:8100); never cached."
      print "    location /api/ {"
      print "        proxy_pass http://127.0.0.1:8100;"
      print "        proxy_http_version 1.1;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "        add_header Cache-Control \"no-store\" always;"
      print "        client_max_body_size 2m;"
      print "    }"
      done = 1
    }
  ' "$BACKUP/$(basename "$SITE")" > "$SITE.tmp"
  if ! grep -q 'location /api/' "$SITE.tmp"; then
    rm -f "$SITE.tmp"
    echo "Couldn't find where to add it; nothing changed." >&2
    exit 1
  fi
  mv "$SITE.tmp" "$SITE"
  if ! nginx -t; then
    cp -p "$BACKUP/$(basename "$SITE")" "$SITE"
    echo "nginx didn't accept it; the old file is back, nothing changed." >&2
    exit 1
  fi
  systemctl reload nginx
  echo "Added and reloaded."
fi

# ---------------------------------------------------------------- 3. updater
say "3/3 Updater: every 5 minutes, log in $LOG"
install -m 755 "$HERE/tap2chef-api-update.sh" "$UPDATER"
printf '%s\n' \
  "# Installs the newest Tap2Chef API from the api branch. See $UPDATER." \
  "*/5 * * * * root /root/tap2chef-api-update.sh >> $LOG 2>&1" > "$CRON"
chmod 644 "$CRON"
echo "Installed."

if git ls-remote https://github.com/DevaMhatre/tap2chef-web.git refs/heads/api | grep -q .; then
  ROOT="$ROOT" "$UPDATER"
  echo "The API is running. Check: curl -s https://tap2chef.devamhatre.com/api/health"
else
  echo "No api branch yet: push main, then run $UPDATER (or wait 5 minutes)."
fi
