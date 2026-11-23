#!/usr/bin/env bash
# Cutover day for Humanup Chat, on the Propium VPS (run from /opt/humanup-chat/infra).
# Steps, in this order; each one can be run alone and again without harm:
#   ./cutover.sh https     Propium's Caddy picks up the chat site (once the DNS record exists; ats.propium.co blinks a few seconds)
#   ./cutover.sh check     DNS, HTTPS for the chat and the hub, containers healthy, Propium → hub announcements
#   ./cutover.sh email     emails on (Resend key copied from Propium's config), Mattermost restarted
#   ./cutover.sh welcome   each agent says hello in each conversation, in the person's language
#   ./cutover.sh invite    "choose your password" email to every person in humans.yaml
set -euo pipefail
cd "$(dirname "$0")"
C=(docker compose -f docker-compose.yml -f docker-compose.propium.yml)
PROPIUM_DIR=/opt/humanup/app
DOMAIN=$(grep '^CHAT_DOMAIN=' .env | cut -d= -f2)
ok() { printf '  \033[32mOK\033[0m   %s\n' "$*"; }
ko() { printf '  \033[31mFAIL\033[0m %s\n' "$*"; FAILED=1; }
FAILED=0

set_env() { # set_env KEY VALUE (in chat/infra/.env)
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
}

step_https() {
  echo "▸ Propium's Caddy reloads its sites (chat.propium.co + /hub)"
  (cd "$PROPIUM_DIR/docker" && docker compose -f docker-compose.prod.yml up -d --force-recreate caddy </dev/null 2>&1 | tail -1)
  echo "  The HTTPS certificate is requested now; give it up to a minute, then: ./cutover.sh check"
}

step_check() {
  echo "▸ Checks for $DOMAIN"
  local ip; ip=$( { getent ahostsv4 "$DOMAIN" || true; } | awk 'NR==1{print $1}')
  if [[ -n "$ip" ]] && hostname -I | tr ' ' '\n' | grep -qx "$ip"; then ok "DNS $DOMAIN → $ip (this server)"; else ko "DNS $DOMAIN → '${ip:-nothing}' (expected one of: $(hostname -I))"; fi
  if curl -fs --max-time 10 "https://$DOMAIN/api/v4/system/ping" >/dev/null; then ok "https://$DOMAIN answers"; else ko "https://$DOMAIN does not answer (run ./cutover.sh https, wait a minute)"; fi
  if curl -fs --max-time 10 "https://$DOMAIN/hub/healthz" >/dev/null; then ok "https://$DOMAIN/hub (agents API) answers"; else ko "https://$DOMAIN/hub does not answer"; fi
  local code; code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/hub/mm/policy" || true)
  if [[ "$code" == "404" ]]; then ok "internal endpoints are not public"; else ko "https://$DOMAIN/hub/mm/* answered $code (should be 404)"; fi
  for svc in mattermost hub postgres; do
    local st; st=$(docker inspect -f '{{.State.Health.Status}}' "humanup-chat-$svc-1" 2>/dev/null || echo missing)
    if [[ "$st" == healthy ]]; then ok "container $svc healthy"; else ko "container $svc: $st"; fi
  done
  if docker exec docker-postgres-1 psql -U humanup -d humanup_prod -Atq -c \
      "select 1 from webhooks where url like 'http://humanup-chat-hub:3100/%' and active" </dev/null | grep -q 1; then
    ok "Propium sends its announcements to the hub"
  else
    ko "no active Propium webhook to the hub"
  fi
  if grep -q '^MM_SEND_EMAILS=true' .env; then ok "emails on"; else echo "  ..   emails off (./cutover.sh email)"; fi
  [[ $FAILED == 0 ]] && echo "All good." || { echo "Fix the FAIL lines above."; exit 1; }
}

step_email() {
  echo "▸ Emails (Resend, same account as Propium)"
  local key; key=$(grep '^SMTP_PASSWORD=' "$PROPIUM_DIR/.env" | cut -d= -f2- | tr -d '"')
  [[ -n "$key" ]] || { echo "No SMTP_PASSWORD in $PROPIUM_DIR/.env" >&2; exit 1; }
  set_env SMTP_HOST smtp.resend.com
  set_env SMTP_PORT 465
  set_env SMTP_SECURITY TLS
  set_env SMTP_USER resend
  set_env SMTP_PASSWORD "$key"
  set_env MM_FROM_EMAIL noreply@humanup.io
  set_env MM_SEND_EMAILS true
  "${C[@]}" up -d mattermost </dev/null 2>&1 | tail -1
  ok "emails on, sent from noreply@humanup.io"
}

step_welcome() {
  echo "▸ Each agent says hello in each conversation (only where the conversation is still empty)"
  "${C[@]}" build seed </dev/null >/dev/null
  "${C[@]}" run --rm seed --welcome </dev/null 2>&1 | tail -2
}

step_invite() {
  echo "▸ \"Choose your password\" emails"
  grep -q '^MM_SEND_EMAILS=true' .env || { echo "Turn emails on first: ./cutover.sh email" >&2; exit 1; }
  for email in $(sed -n 's/^ *email: *\([^ ]*\).*/\1/p' ../humans.yaml); do
    if curl -fsS --max-time 15 -X POST "https://$DOMAIN/api/v4/users/password/reset/send" \
        -H 'Content-Type: application/json' -d "{\"email\":\"$email\"}" >/dev/null; then ok "sent to $email"; else ko "could not send to $email"; fi
  done
}

case "${1:-}" in
  https) step_https ;;
  check) step_check ;;
  email) step_email ;;
  welcome) step_welcome ;;
  invite) step_invite ;;
  *) sed -n '2,9p' "$0"; exit 1 ;;
esac
