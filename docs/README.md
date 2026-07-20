# HumanUp ATS

Plateforme ATS/CRM de recrutement pour cabinets de chasse de tetes.

**Vision (mi-2026) :** MCP-first. Le recruteur vit dans Claude Desktop / claude.ai (connecteur MCP). L'ATS web sert de **read-model visuel** — kanban, fiches, dashboard. Les actions passent par Claude.

Voir `user-guide.md` pour la journee type et `PLAN-SIMPLIFICATION-HUMANUP.md` a la racine du repo pour l'historique de la refonte.

## Stack technique

| Couche          | Technologie                            |
| --------------- | -------------------------------------- |
| Frontend        | React 19, Vite 7, TailwindCSS 4, Zustand |
| Backend         | Fastify 5, Prisma 6, Node 22           |
| Base de donnees | PostgreSQL 16                          |
| Monorepo        | pnpm workspaces, Turborepo             |
| CI/CD           | GitHub Actions, Docker, Caddy          |
| MCP             | @modelcontextprotocol/sdk (Streamable HTTP + OAuth PKCE) |

Redis / BullMQ ont ete retires (aucun consumer restant apres la simplification).

## Prerequis

- **Node.js** >= 20
- **pnpm** >= 10
- **Docker** et **Docker Compose** (pour PostgreSQL en local)

## Demarrage rapide

```bash
git clone https://github.com/humanup-io/ats.git
cd ats
pnpm install
cd docker && docker compose -f docker-compose.dev.yml up -d && cd ..
cp .env.example apps/api/.env
pnpm db:migrate
pnpm db:generate
pnpm db:seed        # 4 users initiaux (mdp Humanup2026!)
pnpm dev
```

Front : `http://localhost:5173` · API : `http://localhost:3001`.

## Structure du projet

```
humanup-ats/
  apps/
    api/               # Backend Fastify
    web/               # Frontend React + Vite
  extension/           # Extension Chrome LinkedIn
  packages/
    shared/            # Types partages
  docker/              # Docker Compose (dev + prod), Caddy
  docs/                # Documentation (dont user-guide.md)
    archive/           # Anciens docs (audits, plans historiques)
```

## Pages web (post-simplification)

Seulement 8 sections dans la sidebar :

1. **Dashboard** (`/`) — Cockpit du matin : agenda + 5 KPIs (Calls, Presentations, RDV, Placements, CA) + kanban actif
2. **Mon Espace** (`/mon-espace`) — Dashboard perso recruteur
3. **Candidats** (`/candidats`) — Liste + fiches
4. **Clients** (`/clients`) — Liste + fiches
5. **Entreprises** (`/entreprises`) — Liste + fiches
6. **Mandats** (`/mandats`) — Liste + kanban + review + placement modal
7. **Emails** (`/emails`) — Inbox Gmail integree
8. **Import** (`/import`) — Import Excel/CSV

Section **Admin** (Meroe only) :
- **Analytics** (`/admin/analytics`) — Hub regroupant leaderboard, placements, revenue-forecast, pipeline-intelligence, alerts, reports, clients-pipeline
- **Parametres** (`/settings`) — Users, integrations
- **Logs MCP** (`/mcp-logs`) — Traces des tool calls Claude

## Outils MCP (chat Claude)

Environ 40 tools disponibles. Les principaux :

- `get_daily_brief` — Cockpit du matin (KPIs + agenda + relances + suggestion de blocs)
- `plan_my_day` — Propose une organisation de journee en blocs horaires
- `list_relances_todo` — Candidats a relancer (sans activite depuis N jours)
- `search_candidates` / `get_candidate` — Recherche vivier
- `create_candidate` / `update_candidate` — Gestion candidats
- `move_candidate_stage` — Changement de stage (avec fee/date obligatoires pour PLACE)
- `create_mandate` / `search_mandates` / `get_mandate` — Gestion mandats
- `create_rdv` — Nouveau RDV dans Google Calendar
- `click_to_call` — Lance appel Allo
- `send_email` — Envoi email
- `search_talents_kalent` — Recherche 200M+ profils Kalent (cle partagee equipe)
- `enrich_contact` — Enrichissement FullEnrich (email/phone)
- `get_recruiter_stats` — Stats d'un recruteur specifique (admin)

Voir `guide-mcp-equipe.md` pour configurer le connecteur MCP.

## Scripts disponibles

| Commande               | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `pnpm dev`             | Lance API + Web en mode dev                    |
| `pnpm build`           | Build production                               |
| `pnpm test`            | Lance tous les tests                           |
| `pnpm test:unit`       | Tests unitaires uniquement                     |
| `pnpm test:integration` | Tests d'integration                          |
| `pnpm db:migrate`      | Applique les migrations Prisma                 |
| `pnpm db:generate`     | Genere le client Prisma                        |
| `pnpm db:seed`         | Cree les 4 users initiaux                      |
| `pnpm db:reset`        | Reset complet de la base                       |
| `pnpm lint`            | Lint                                           |
| `pnpm typecheck`       | Verification TypeScript                        |

## Variables d'environnement

Voir `.env.example` pour la liste complete. Principales :

| Variable                | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `DATABASE_URL`          | URL PostgreSQL                                    |
| `TZ`                    | `Europe/Paris` (fixe le runtime Node)             |
| `JWT_*_SECRET`          | Secrets JWT access + refresh                      |
| `SMTP_*`                | Reset password uniquement (le reste via Gmail API) |
| `GOOGLE_CLIENT_*`       | OAuth Google (Gmail + Calendar + Drive)           |
| `ANTHROPIC_API_KEY`     | Claude API (features IA)                          |
| `GEMINI_API_KEY`        | Gemini (features IA secondaires)                  |
| `ALLO_API_KEY`          | Telephonie Allo (calls + transcripts)             |
| `PAPPERS_API_KEY`       | Enrichissement entreprises FR (SIREN/SIRET/CA)    |
| `FULLENRICH_API_KEY`    | Enrichissement contacts (email/phone)             |
| `KALENT_API_KEY`        | Sourcing Kalent (200M+ profils, cle equipe)       |
| `SLACK_WEBHOOK_URL`     | Rapport journalier equipe                         |
| `SLACK_BOT_TOKEN`       | DMs bot (close-won, alerts par slackUserId)       |
| `MCP_PUBLIC_URL`        | Metadata OAuth du serveur MCP                     |

## Documentation

- [`user-guide.md`](./user-guide.md) — Guide utilisateur : la journee type MCP-first
- [`guide-mcp-equipe.md`](./guide-mcp-equipe.md) — Configuration du connecteur MCP (Claude Desktop)
- [`deployment.md`](./deployment.md) — Guide de deploiement prod
- [`import-guide.md`](./import-guide.md) — Import Excel/CSV
- [`allo-integration-setup.md`](./allo-integration-setup.md) — Setup Allo VoIP
- [`google-integration-setup.md`](./google-integration-setup.md) — Setup OAuth Google
- [`archive/`](./archive/) — Anciens audits et plans (Q1-Q2 2026)
