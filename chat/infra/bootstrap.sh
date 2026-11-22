#!/usr/bin/env bash
# One-time: create the "humanup-admin" system admin account used by the seed (and later the Hub),
# and store its access token in .secrets/admin-token. Safe to re-run.
# Usage (from chat/infra):  ./bootstrap.sh [extra compose args, e.g. -f docker-compose.yml -f docker-compose.local.yml]
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .secrets
chmod 700 .secrets

COMPOSE=(docker compose "$@")
mmctl() { "${COMPOSE[@]}" exec -T mattermost mmctl --local "$@"; }

echo "Waiting for Mattermost..."
for _ in $(seq 1 60); do
  if mmctl system status >/dev/null 2>&1; then break; fi
  sleep 3
done

if [[ -s .secrets/admin-token ]]; then
  echo "Admin token already present in .secrets/admin-token, nothing to do."
  exit 0
fi

if ! mmctl user search humanup-admin 2>/dev/null | grep -q humanup-admin; then
  pw=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 28)
  mmctl user create --email admin@chat.humanup.local --username humanup-admin \
    --password "${pw}Aa1!" --system-admin --disable-welcome-email >/dev/null
  echo "Created system admin humanup-admin (password not stored: the account is used through its token only)."
fi

token=$(mmctl token generate humanup-admin "seed and hub" --json 2>/dev/null | sed -n 's/.*"token": *"\([^"]*\)".*/\1/p' | head -1)
if [[ -z "$token" ]]; then
  # Older mmctl prints "<token>: <description>"
  token=$(mmctl token generate humanup-admin "seed and hub" | awk -F: '{print $1}' | tr -d ' ' | head -1)
fi
[[ -n "$token" ]] || { echo "Could not generate a token" >&2; exit 1; }
umask 077
printf '%s' "$token" > .secrets/admin-token
echo "Token written to .secrets/admin-token"
