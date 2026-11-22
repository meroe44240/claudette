# Humanup Chat

Self-hosted Mattermost where the team and the AI agents work together, connected to Propium.
Design: [docs/humanup-chat/ARCHITECTURE.md](../docs/humanup-chat/ARCHITECTURE.md).

| Folder | What |
|---|---|
| `infra/` | Docker Compose: Mattermost Team Edition, Postgres, Caddy (HTTPS), daily backups |
| `seed/` | Creates teams, people, agent bots, channels, DMs and sidebars from the YAML files. `verify.ts` checks the result |
| `humans.yaml` | The team: email, position, timezone, language agents use with each person |
| `agents.yaml` | The agents: name, title, scope, reporting line and rules (rules enforced by the Agent Hub from phase 2) |
| `avatars/` | Agent photos, `<key>.png` |
| `hub/`, `plugin/` | Phase 2 and 3 |

## What the seed sets up

- Team **Humanup**: everyone, the visible agents, the `humanup` (system) and `propium` (announcements) bots.
- Team **Private**: Méroë, Camille, Malik. Direct messages only work between people who share a team, so the team can't find or DM them.
- Channels: `#general` (Town Square renamed; Mattermost does not let anyone leave it, so bots are members but will be blocked from posting in phase 3), `#news`, `#performance` (humans + Maya), `#agents-ops` (private: Méroë + agents), `#approvals` (private: Méroë + system bot). `off-topic` is archived.
- One DM per person and agent (hidden agents: Méroë only; Sentinel: nobody).
- Sidebar for each person: **Team** then **Agents** (alphabetical).
- Every person in Asia/Ho_Chi_Minh, English interface.
- Secrets in `infra/.secrets/` (never committed): `admin-token`, `seed-secrets.json` (bot tokens for the Hub, initial passwords).

## Current install: the Propium VPS

Humanup Chat runs on the Propium server (`ats.propium.co`) in `/opt/humanup-chat`, at **https://chat.propium.co**.
Propium's Caddy (`docker/caddy/Caddyfile.prod`) owns ports 80/443 and forwards `chat.propium.co` to the `humanup-chat` alias on Propium's Docker network. Every command adds the Propium override:

```bash
cd /opt/humanup-chat/infra
C="docker compose -f docker-compose.yml -f docker-compose.propium.yml"
$C up -d                                   # start / update
./bootstrap.sh -f docker-compose.yml -f docker-compose.propium.yml
$C build seed && $C run --rm seed          # after editing a YAML file
$C run --rm --entrypoint npx seed tsx src/verify.ts
```

Update the files from your machine: `tar --exclude=seed/node_modules --exclude=infra/.secrets --exclude=infra/.env -czf - -C chat . | ssh root@ats.propium.co 'tar -xzf - -C /opt/humanup-chat'`.
A Propium deploy does not restart Caddy: after changing `Caddyfile.prod`, run `docker compose -f docker-compose.prod.yml up -d --force-recreate caddy` in `/opt/humanup/app/docker`.

## Install on a dedicated server

Ubuntu 24.04, 2 vCPU / 4 GB RAM is plenty for this team. A DNS `A` record for the chat domain must point at the server first (Caddy gets the HTTPS certificate on its own).

```bash
# from your machine
rsync -a --exclude seed/node_modules --exclude infra/.secrets --exclude infra/.env chat/ root@SERVER:/opt/humanup-chat/
ssh root@SERVER
cd /opt/humanup-chat/infra
bash install.sh              # Docker, firewall, .env with a random DB password
nano .env                    # CHAT_DOMAIN=chat.humanup.io
docker compose up -d
./bootstrap.sh               # system admin account for the seed and the Hub, token in .secrets/
docker compose run --rm seed
docker compose run --rm --entrypoint npx seed tsx src/verify.ts
```

Re-run `docker compose build seed && docker compose run --rm seed` after editing a YAML file or adding photos.
`--welcome` posts a first message from each agent in every DM (keep it for cutover day).

## Backups

Every day at 03:00 (Ho Chi Minh): every Postgres database (`pg_dump -Fc`) and the Mattermost files, kept 14 days in the `backups` volume. Off-site copy when `RCLONE_REMOTE` is set (see `infra/backup/rclone.conf`).
Run one now: `docker compose exec backup backup.sh`.
Restore: `pg_restore -d mattermost --clean <file>.dump`, then untar the files into the `mm_data` volume.

## Local test (no Docker)

Docker Desktop is not required: the WSL test used Mattermost's Linux build with a local Postgres and the same settings. With Docker: `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d`, then `./bootstrap.sh -f docker-compose.yml -f docker-compose.local.yml` and `cd ../seed && npm i && MM_URL=http://localhost:8065 npm run seed`.
