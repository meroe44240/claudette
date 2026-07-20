# Guide utilisateur — HumanUp ATS

_L'ATS est un read-model. Claude fait le reste._

## Journée type

Ouvre **Claude Desktop** (ou claude.ai) avec le connecteur MCP HumanUp configuré (voir `guide-mcp-equipe.md`).

### 9h — Le brief du matin

Tape dans le chat :

```
Ma journée
```

Claude appelle `get_daily_brief` et te renvoie :

- 📅 Tes RDV de la journée (agenda Google Calendar)
- 📊 5 KPIs du mois : Calls, Présentations, RDV, Placements, CA
- 🎯 Pipeline actif : top mandats + candidats par stage
- 🔔 Relances à faire (candidats sans activité depuis > 7 jours)
- ✅ Tes tâches en retard + du jour
- 👉 Une proposition de blocs horaires pour la journée

Si tu veux, tu dis simplement :

```
Go — organise ma journée en blocs
```

Claude appelle `plan_my_day` puis, sur validation, `create_rdv` pour matérialiser les blocs dans ton Google Calendar.

### Pendant les appels

Depuis Claude :

```
Appelle Sacha Jakoljevic
```

→ `click_to_call` déclenche l'appel via Allo. Après l'appel, le transcript est auto-parsé, une activité `APPEL` est créée sur la fiche candidat.

### Après un call — décisions

```
Passe Sacha en entretien client sur le mandat DILISCO
```

Claude appelle `move_candidate_stage` avec `new_stage: ENTRETIEN_CLIENT`.

Pour un **close won** :

```
Passe Sacha en placé sur DILISCO — fee 12k, démarrage 2 septembre, source LinkedIn Recruiter, lead cold call
```

Claude appelle `move_candidate_stage` avec `new_stage: PLACE` + les 4 champs obligatoires (fee_montant_facture + date_demarrage + source_placement + source_lead). Si tu oublies un champ, Claude te le demande avant d'écrire quoi que ce soit en base.

### Ajouter un candidat

```
Crée un candidat : Marie Dupont, Sales Manager chez Datadog, marie.dupont@datadog.com
```

→ `create_candidate` (avec confirmation).

### Rechercher un profil externe

```
Trouve-moi 5 SDR à Paris avec expérience SaaS
```

→ `search_talents_kalent` (via la clé Kalent partagée de l'équipe, 200M+ profils).

Pour du sourcing FullEnrich :

```
Enrichis le contact John Doe chez ACME — email uniquement
```

→ `enrich_contact` (1 crédit pour email, 10 pour phone, 11 pour les deux).

### Relances

```
Liste les candidats à relancer depuis plus de 5 jours
```

→ `list_relances_todo(days=5)`.

Puis :

```
Envoie un mail de relance à Boris
```

→ `send_email` (avec confirmation).

### Voir ses stats

```
Mes stats du trimestre
```

→ `get_my_stats(period=this_quarter)`.

Pour l'admin (Méroë) :

```
Stats de Valentin sur Q2
```

→ `get_recruiter_stats(user_email=valentin, period=this_quarter)` — retourne appels total + moyenne/jour ouvré, nouvelles opportunités, mandats fermés, présentations, deals closés.

Ou pour l'équipe :

```
Brief équipe cette semaine
```

→ `get_team_brief(period=this_week)`.

## Quand utiliser l'ATS (web)

L'ATS `https://ats.propium.co` sert de **read-model visuel**. Tu l'ouvres quand :

- Tu veux **voir le kanban** d'un mandat (drag-and-drop des candidats reste possible)
- Tu veux **la fiche complète** d'un candidat, client, entreprise (historique timeline, activités, pitch IA)
- Tu veux **le dashboard** avec les 5 KPIs visuels en gros
- Tu veux **les analytics avancées** (leaderboard, placements post-embauche, forecast revenus, alertes) — page `/admin/analytics`, admin only

Sinon : reste dans le chat Claude. Tout se fait plus vite.

## Notifications

Toutes les notifications passent par **Slack DM** (via ton `slackUserId`). Plus de badge cloche dans l'ATS.

Types de notifs Slack :
- 🏆 CLOSE WON (avec candidat, client, mandat, fee, date démarrage, sources, recruteur)
- 🤝 Nouvelle présentation client
- 📅 Nouveau RDV
- ⚠️ Alerte mandat dormant
- 📊 Rapport quotidien de l'équipe (Lundi-Vendredi 9h Paris)

## Ce que l'ATS ne fait plus (features supprimées mi-2026)

Retirées lors de la simplification radicale (voir `PLAN-SIMPLIFICATION-HUMANUP.md` à la racine) :

- **Séquences email multicanales** — Claude compose et envoie à la demande via `send_email`.
- **Push CV auto-detect** — Envoie manuel via `send_email` ou `enrich_contact` + `send_email`.
- **Job Board public** (`/jobs/*`) — Canal d'entrée fermé. Les candidatures rentrent via LinkedIn / Kalent / import manuel.
- **Booking public** (`/book/:slug`) — Plus de lien Calendly-like. Les RDV se prennent en direct via Google Calendar (`create_rdv` MCP).
- **SDR Manager** — Feature abandonnée.
- **Adchase** — Feature abandonnée.
- **Templates email** — Claude génère à la volée à partir du contexte.
- **Notifications in-app** — Tout via Slack.
- **Pages `/activites` et `/taches`** — Le tracking auto continue (Gmail sync, Allo, Calendar), alimente les timelines des fiches. Les tâches se gèrent via MCP (`get_my_tasks`, `create_task`, `complete_task`).

## Support

- Bug ou question sur un tool MCP : dans le chat Claude, tape le tool name pour voir sa description.
- Bug côté ATS web : envoie un screenshot dans Slack.
- Nouveau besoin : décris-le en 2 lignes dans Slack, on l'ajoute au backlog.
