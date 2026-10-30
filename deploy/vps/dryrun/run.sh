#!/usr/bin/env bash
# Dry run of deploy/vps against a copy of the live tap2chef nginx config.
set -uo pipefail
# Usage: bash deploy/vps/dryrun/run.sh   (needs: python3 -m venv $DRY/venv && $DRY/venv/bin/pip install crossplane)
HERE=$(cd "$(dirname "$0")" && pwd)
export DRY=${DRY:-$(mktemp -d)}
mkdir -p "$DRY/live"
cp "$HERE/live-tap2chef.conf" "$DRY/live/tap2chef.devamhatre.com"
cp -r "$HERE/stubs" "$DRY/"
D=$DRY
REPO=$(cd "$HERE/.." && pwd)
FAILS=0
ok()   { echo "ok    $*"; }
bad()  { echo "FAIL  $*"; FAILS=$((FAILS + 1)); }
expect() { if eval "$1"; then ok "$2"; else bad "$2"; fi; }

fresh() {
  rm -rf "$D/root" "$D/state" "$D/calls"
  mkdir -p "$D/root/etc/nginx/sites-enabled" "$D/root/root" "$D/root/etc/cron.d" "$D/root/var/www" "$D/state/api-src-parent"
  cp "$D/live/tap2chef.devamhatre.com" "$D/root/etc/nginx/sites-enabled/"
  touch "$D/calls"
}
SITE() { echo "$D/root/etc/nginx/sites-enabled/tap2chef.devamhatre.com"; }
setup() { ROOT="$D/root" ROOT_SITE="$(SITE)" PATH="$D/stubs:$PATH" bash "$REPO/setup-api.sh" > "$D/out" 2>&1; echo $? > "$D/code"; }
update() { ROOT="$D/root" NVM_DIR=/nonexistent PATH="$D/stubs:$PATH" bash "$D/root/root/tap2chef-api-update.sh" > "$D/out" 2>&1; echo $? > "$D/code"; }
fill_env() { sed -i '' -e 's/PASSWORD/s3cret/' -e 's/^RESEND_API_KEY=$/RESEND_API_KEY=re_test/' "$D/root/etc/tap2chef-api.env"; }
api_version() { rm -rf "$D/state/api-src-parent"; mkdir -p "$D/state/api-src-parent"; echo "// $1" > "$D/state/api-src-parent/index.js"; echo "$1" > "$D/state/api-sha"; }

echo "--- baseline: the live config parses"
fresh; ROOT_SITE="$(SITE)" PATH="$D/stubs:$PATH" nginx -t >/dev/null; expect '[ $? = 0 ]' "live config parses as nginx would"

echo "--- A. first run: makes the env file, stops, touches nothing else"
fresh; setup
expect '[ "$(cat $D/code)" = 2 ]' "stops with exit 2 until secrets are filled in"
expect '[ "$(stat -f %Lp $D/root/etc/tap2chef-api.env)" = 600 ]' "env file is mode 600"
expect 'grep -qE "^JWT_SECRET=[0-9a-f]{64}$" $D/root/etc/tap2chef-api.env' "a fresh 64-hex JWT secret"
expect 'grep -q "HOST=127.0.0.1" $D/root/etc/tap2chef-api.env && grep -q "PORT=8100" $D/root/etc/tap2chef-api.env' "listens on 127.0.0.1:8100"
expect 'cmp -s $(SITE) $D/live/tap2chef.devamhatre.com' "nginx file untouched"
expect '! grep -qE "^(nginx|systemctl|pm2)" $D/calls' "no nginx, systemctl or pm2 calls"
expect '! grep -q "s3cret\|re_test" $D/out' "prints no secrets"
secret=$(grep JWT_SECRET "$D/root/etc/tap2chef-api.env")
setup
expect '[ "$(grep JWT_SECRET $D/root/etc/tap2chef-api.env)" = "$secret" ]' "running again keeps the same secret"

echo "--- B. filled in: adds /api/, reloads nginx, installs the updater; no api branch yet"
fill_env; setup; cat "$D/out" | sed 's/^/      | /'
expect '[ "$(cat $D/code)" = 0 ]' "succeeds"
expect '[ "$(grep -c "location /api/" $(SITE))" = 1 ]' "one /api/ block"
expect '! diff $D/live/tap2chef.devamhatre.com $(SITE) | grep -q "^<"' "nothing else in the file changed (only lines added)"
expect 'awk "/listen 443/{l=NR} /location \/api\//{a=NR} END{exit !(a && a<l)}" $(SITE)' "the block is in the https server, before certbot's lines"
expect '[ "$(grep -c "managed by Certbot" $(SITE))" = "$(grep -c "managed by Certbot" $D/live/tap2chef.devamhatre.com)" ]' "every certbot line kept"
expect 'grep -q "nginx -t" $D/calls && grep -q "systemctl reload nginx" $D/calls' "tested, then reloaded"
expect 'ls -d $D/root/root/tap2chef-backup-* >/dev/null 2>&1 && cmp -s $D/root/root/tap2chef-backup-*/tap2chef.devamhatre.com $D/live/tap2chef.devamhatre.com' "backup is the original"
expect 'grep -q "^\*/5 \* \* \* \* root /root/tap2chef-api-update.sh >> /var/log/tap2chef-api-deploy.log 2>&1$" $D/root/etc/cron.d/tap2chef-api' "cron entry every 5 minutes, own log"
expect '[ -x $D/root/root/tap2chef-api-update.sh ]' "updater installed, executable"
expect 'grep -q "No api branch yet" $D/out' "says to push when there is no api branch"
expect '! grep -q "s3cret\|re_test" $D/out' "prints no secrets"

echo "--- C. again: changes nothing"
cp "$(SITE)" "$D/site.after-b"; backups=$(ls -d $D/root/root/tap2chef-backup-* | wc -l); : > "$D/calls"; sleep 1; setup
expect '[ "$(cat $D/code)" = 0 ] && cmp -s $(SITE) $D/site.after-b' "same file"
expect '[ "$(ls -d $D/root/root/tap2chef-backup-* | wc -l)" = "$backups" ]' "no new backup"
expect '! grep -q "systemctl reload" $D/calls' "no reload"

echo "--- D. nginx refuses: the old file comes back, no reload"
fresh; setup >/dev/null; fill_env; touch "$D/state/nginx-fail"; setup
expect '[ "$(cat $D/code)" = 1 ]' "fails"
expect 'cmp -s $(SITE) $D/live/tap2chef.devamhatre.com' "file is exactly the original again"
expect '! grep -q "systemctl reload" $D/calls' "never reloaded"
expect '[ ! -e $D/root/etc/cron.d/tap2chef-api ]' "updater not installed"

echo "--- E. updater, first API version, healthy"
fresh; setup >/dev/null; fill_env; setup >/dev/null; api_version aaa1111; touch "$D/state/healthy"; : > "$D/calls"; update
expect '[ "$(cat $D/code)" = 0 ]' "succeeds"; sed 's/^/      | /' "$D/out"
expect '[ "$(cat $D/root/var/www/tap2chef-api/.deployed)" = aaa1111 ]' "deployed aaa1111"
expect '[ "$(readlink $D/root/var/www/tap2chef-api/.env)" = "$D/root/etc/tap2chef-api.env" ]' ".env points at the secrets file"
expect 'grep -q "npm ci --omit=dev" $D/calls' "production dependencies installed"
grep pm2 "$D/calls" | sed "s#$D#<dry>#g; s/^/      calls: /"
expect 'grep -q "pm2 start .*tap2chef-api/index.js --name tap2chef-api" $D/calls && grep -q "pm2 save" $D/calls' "started under pm2, saved for reboots"

echo "--- F. same version again: does nothing"
: > "$D/calls"; update
expect '[ "$(cat $D/code)" = 0 ] && ! grep -qE "^(curl|npm|pm2)" $D/calls' "no download, no restart"

echo "--- G. a new version that doesn't answer: the previous one comes back"
api_version bbb2222; rm "$D/state/healthy"; : > "$D/calls"; update
expect '[ "$(cat $D/code)" = 1 ]' "fails"; sed 's/^/      | /' "$D/out"
expect '[ "$(cat $D/root/var/www/tap2chef-api/.deployed)" = aaa1111 ]' "aaa1111 is back"
expect '[ "$(grep -c "pm2 restart tap2chef-api" $D/calls)" = 2 ]' "restarted onto the new, then back onto the old"
expect '[ -d $D/root/var/www/tap2chef-api.failed ]' "the failed one is kept to look at"
expect '! grep -q "pm2 save" $D/calls' "the failed state isn't saved"
touch "$D/state/healthy"; update
expect '[ "$(cat $D/root/var/www/tap2chef-api/.deployed)" = bbb2222 ]' "next run, once healthy, takes bbb2222"

echo "--- H. the very first version doesn't answer: nothing left running"
fresh; setup >/dev/null; fill_env; setup >/dev/null; api_version ccc3333; : > "$D/calls"; update
expect '[ "$(cat $D/code)" = 1 ] && grep -q "pm2 delete tap2chef-api" $D/calls && [ ! -e $D/root/var/www/tap2chef-api ]' "removed from pm2, nothing installed"

echo "--- I. the site branch by mistake: refused before anything moves"
fresh; setup >/dev/null; fill_env; setup >/dev/null; api_version ddd4444; echo "<html>" > "$D/state/api-src-parent/index.html"; touch "$D/state/healthy"; update
expect '[ "$(cat $D/code)" = 1 ] && [ ! -e $D/root/var/www/tap2chef-api ] && [ ! -e $D/root/var/www/tap2chef-api.new ]' "refused, nothing installed"

echo; [ "$FAILS" = 0 ] && echo "all passed" || echo "$FAILS FAILED"
