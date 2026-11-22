#!/usr/bin/env bash
# First install on a fresh Ubuntu 24.04 server (run as root, from the copied chat/ folder):
#   rsync -a chat/ root@<server>:/opt/humanup-chat/      (from your machine)
#   ssh root@<server> 'cd /opt/humanup-chat/infra && ./install.sh'
# Then: edit .env, `docker compose up -d`, ./bootstrap.sh, `docker compose run --rm seed`.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null; then
  apt-get update -y
  apt-get install -y docker.io docker-compose-v2 ufw
  systemctl enable --now docker
fi

ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

if [[ ! -f .env ]]; then
  cp .env.example .env
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)/" .env
  chmod 600 .env
  echo "Created .env with a random Postgres password. Set CHAT_DOMAIN (and SMTP later), then run:"
  echo "  docker compose up -d && ./bootstrap.sh && docker compose run --rm seed"
fi
chmod +x bootstrap.sh backup/backup.sh
mkdir -p .secrets && chmod 700 .secrets
