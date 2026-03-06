# Guide de deploiement - HumanUp ATS

## Prerequis serveur

- **Docker** >= 24 et **Docker Compose** >= 2.20
- **Serveur** : 2 vCPU, 4 Go RAM minimum (recommande : 4 vCPU, 8 Go)
- **Stockage** : 40 Go SSD minimum
- **Domaine** : DNS A record pointant vers l'IP du serveur (ex: `app.humanup.io`)
- Ports **80** et **443** ouverts

## 1. Preparation

```bash
# Cloner le repo sur le serveur
git clone https://github.com/humanup-io/ats.git
cd ats

# Copier et configurer les variables de production
cp .env.production.example .env
```

Editer le fichier `.env` et remplacer toutes les valeurs `CHANGE_ME` :

| Variable              | Valeur attendue                                |
| --------------------- | ---------------------------------------------- |
| `POSTGRES_PASSWORD`   | Mot de passe fort (32+ caracteres aleatoires)  |
| `JWT_ACCESS_SECRET`   | Chaine aleatoire de 64 caracteres              |
| `JWT_REFRESH_SECRET`  | Chaine aleatoire de 64 caracteres (differente) |
| `SMTP_PASSWORD`       | Cle API Resend                                 |
| `DOMAIN`              | Votre domaine (ex: `app.humanup.io`)           |

Pour generer des secrets aleatoires :

```bash
openssl rand -hex 32
```

## 2. Lancement

```bash
# Build et demarrage des services
cd docker
docker compose -f docker-compose.prod.yml --env-file ../.env up -d --build
```

Cela demarre 5 services :
- **postgres** : Base de donnees PostgreSQL 16
- **redis** : Cache et file d'attente Redis 7
- **api** : Backend Fastify (port interne 3001)
- **web** : Frontend nginx (port interne 80)
- **caddy** : Reverse proxy avec SSL automatique (ports 80/443)

## 3. Migrations

```bash
# Appliquer les migrations sur la base de production
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

## 4. Seed des utilisateurs de production

```bash
# Creer les 4 utilisateurs initiaux
docker compose -f docker-compose.prod.yml exec api npx tsx prisma/seed-prod.ts
```

Les utilisateurs crees :

| Email                    | Role      | Mot de passe initial |
| ------------------------ | --------- | -------------------- |
| `meroe@humanup.io`       | ADMIN     | `Humanup2026!`       |
| `guillermo@humanup.io`   | RECRUTEUR | `Humanup2026!`       |
| `valentin@humanup.io`    | RECRUTEUR | `Humanup2026!`       |
| `marie@humanup.io`       | RECRUTEUR | `Humanup2026!`       |

Tous les utilisateurs devront changer leur mot de passe a la premiere connexion (`mustChangePassword: true`).

## 5. SSL avec Caddy

Caddy gere automatiquement les certificats SSL via Let's Encrypt. Il suffit que :
- Le domaine pointe vers l'IP du serveur (DNS A record)
- Les ports 80 et 443 soient accessibles depuis Internet

Caddy obtient et renouvelle les certificats automatiquement.

La configuration se trouve dans `docker/caddy/Caddyfile.prod`.

## 6. Verification

```bash
# Verifier que tous les services sont UP
docker compose -f docker-compose.prod.yml ps

# Tester le health check de l'API
curl https://app.humanup.io/api/health

# Consulter les logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
```

## 7. Sauvegardes

### Sauvegarde de la base de donnees

```bash
# Sauvegarde manuelle
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U humanup humanup_prod > backup_$(date +%Y%m%d_%H%M%S).sql

# Restauration
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U humanup humanup_prod < backup_20260303_120000.sql
```

### Sauvegarde automatique (cron)

Ajouter au crontab du serveur :

```bash
# Sauvegarde quotidienne a 3h du matin
0 3 * * * cd /path/to/ats/docker && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U humanup humanup_prod | gzip > /backups/humanup_$(date +\%Y\%m\%d).sql.gz
```

## 8. Mise a jour

```bash
cd /path/to/ats

# Recuperer les dernieres modifications
git pull origin main

# Rebuild et redemarrage
cd docker
docker compose -f docker-compose.prod.yml up -d --build

# Appliquer les nouvelles migrations
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

## 9. Monitoring

Verifier regulierement :
- Les logs API pour les erreurs : `docker compose -f docker-compose.prod.yml logs api`
- L'espace disque : `df -h`
- L'utilisation memoire : `free -m`
- Le statut des conteneurs : `docker compose -f docker-compose.prod.yml ps`
