# HumanUp ATS/CRM

Plateforme ATS (Applicant Tracking System) et CRM de recrutement pour cabinets de chasse de tetes.

## Stack technique

| Couche       | Technologie                                 |
| ------------ | ------------------------------------------- |
| Frontend     | React 19, Vite 7, TailwindCSS 4, Zustand   |
| Backend      | Fastify 5, Prisma 6, Node 22               |
| Base de donnees | PostgreSQL 16                            |
| Cache / Queue | Redis 7, BullMQ                            |
| Monorepo     | pnpm workspaces, Turborepo                  |
| CI/CD        | GitHub Actions, Docker, Caddy              |

## Prerequis

- **Node.js** >= 20
- **pnpm** >= 10
- **Docker** et **Docker Compose** (pour PostgreSQL et Redis en local)

## Demarrage rapide

```bash
# 1. Cloner le repo
git clone https://github.com/humanup-io/ats.git
cd ats

# 2. Installer les dependances
pnpm install

# 3. Lancer PostgreSQL + Redis
cd docker && docker compose up -d && cd ..

# 4. Configurer les variables d'environnement
cp .env.example apps/api/.env

# 5. Appliquer les migrations et generer le client Prisma
pnpm db:migrate
pnpm db:generate

# 6. (Optionnel) Peupler la base avec des donnees de demo
pnpm db:seed

# 7. Lancer le dev
pnpm dev
```

Le frontend est accessible sur `http://localhost:5173` et l'API sur `http://localhost:3001`.

## Structure du projet

```
humanup-ats/
  apps/
    api/          # Backend Fastify (port 3001)
    web/          # Frontend React + Vite (port 5173)
  extension/      # Extension Chrome LinkedIn
  packages/
    shared/       # Types et utilitaires partages
  docker/         # Docker Compose (dev + prod), Caddy
  docs/           # Documentation
```

## Scripts disponibles

| Commande              | Description                             |
| --------------------- | --------------------------------------- |
| `pnpm dev`            | Lance API + Web en mode dev             |
| `pnpm build`          | Build de production (tous les packages) |
| `pnpm test`           | Lance tous les tests                    |
| `pnpm test:unit`      | Tests unitaires uniquement              |
| `pnpm test:integration` | Tests d'integration                   |
| `pnpm db:migrate`     | Applique les migrations Prisma          |
| `pnpm db:generate`    | Genere le client Prisma                 |
| `pnpm db:seed`        | Peuple la base de dev                   |
| `pnpm db:reset`       | Reset complet de la base                |
| `pnpm lint`           | Lint du code                            |
| `pnpm typecheck`      | Verification TypeScript                 |

## Variables d'environnement

Voir `.env.example` pour la liste complete des variables en dev et `.env.production.example` pour la production.

Les variables principales :

| Variable             | Description                          |
| -------------------- | ------------------------------------ |
| `DATABASE_URL`       | URL de connexion PostgreSQL          |
| `REDIS_URL`          | URL de connexion Redis               |
| `JWT_ACCESS_SECRET`  | Secret pour les tokens JWT access    |
| `JWT_REFRESH_SECRET` | Secret pour les tokens JWT refresh   |
| `SMTP_*`             | Configuration email (Resend)         |
| `ANTHROPIC_API_KEY`  | Cle API Claude (parsing transcripts) |
| `GOOGLE_CLIENT_*`    | OAuth Google (Gmail, Calendar)       |
| `ALLO_API_KEY`       | Integration telephonie Allo          |

## Documentation

- [Guide de deploiement](./deployment.md)
- [Guide d'import](./import-guide.md)
