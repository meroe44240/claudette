# 🔍 Audit Produit Complet — HumanUp ATS

**Date :** 4 mars 2026
**Version :** Pre-production
**Auditeur :** Triple expertise (Product Manager / QA Lead / Directeur de cabinet)
**Méthode :** Navigation complète de l'application + tests fonctionnels + revue de code

---

## 1. RÉSUMÉ EXÉCUTIF

### Note globale : 6/10

HumanUp ATS est un outil ambitieux et visuellement soigné, avec un périmètre fonctionnel impressionnant pour un ATS de cabinet de recrutement. L'architecture technique est solide (React + Fastify + Prisma + PostgreSQL), le design system est cohérent, et les intégrations (Gmail, Google Calendar) apportent une vraie valeur. Cependant, plusieurs bugs critiques empêchent un déploiement en production.

### 3 Forces principales

1. **Dashboard SPA 360 très complet** — Vue unique avec agenda, mandats, messages, tâches, KPIs, graphe d'activité et calendrier. L'intégration Gmail/Calendar donne un vrai cockpit de pilotage au recruteur.

2. **Richesse fonctionnelle remarquable** — 14+ modules (Candidats, Clients, Entreprises, Mandats, Séquences multicanal, SDR Manager, Adchase, Templates, Notifications...). Le périmètre couvre plus que la majorité des ATS concurrents en phase MVP.

3. **Design system cohérent et moderne** — TailwindCSS bien utilisé, animations Framer Motion fluides, sidebar collapsible, palette brand violet (#7C5CFC) appliquée partout. L'UI est professionnelle et inspire confiance.

### 3 Faiblesses critiques

1. **Bugs bloquants sur des pages essentielles** — La page Tâches affiche "Aucune tâche" (endpoint 404), les onglets Paramètres ne changent pas de contenu, Mon Espace montre des données à 0. Ce sont des pages qu'un recruteur utilise tous les jours.

2. **Responsive cassé** — À 1280×720 (laptop standard), la colonne Messages+Tâches du dashboard disparaît complètement. À 768px (tablette), 2 colonnes sur 3 sont absentes. L'app n'est utilisable qu'en Full HD.

3. **Données incohérentes entre pages** — Le dashboard montre 8 tâches mais la page Tâches en montre 0. Le bandeau affiche "71 923 emails non lus" (nombre absurde). Mon Espace montre 0 mandats alors que le dashboard en liste 5. L'utilisateur perd confiance.

### Recommandation

**❌ PAS prêt pour la production.** Sprint de 1-2 semaines de bug fixes nécessaire avant toute mise en main d'un utilisateur. Les bugs sur les Tâches, Paramètres et Mon Espace sont des deal-breakers. Le responsive doit être corrigé au minimum pour 1440px et 1280px.

---

## 2. BUGS

| # | Page | Description | Sévérité | Étapes de reproduction | Impact utilisateur |
|---|------|-------------|----------|------------------------|-------------------|
| 1 | Tâches | La page affiche "Aucune tâche" alors que l'API /taches retourne 15 tâches | 🔴 Critique | Aller sur /taches → page vide | Le recruteur ne voit pas ses tâches du jour. Il oublie des follow-ups, perd des deals. |
| 2 | Tâches | Le frontend appelle `/activites/taches` (404) au lieu de `/taches` | 🔴 Critique | Ouvrir DevTools → Network → voir 404 | Endpoint inexistant, page entièrement cassée |
| 3 | Paramètres | Les onglets Intégrations, Pipeline, Notifications ne changent pas le contenu affiché (reste sur Équipe) | 🔴 Critique | Aller sur /settings → cliquer Intégrations → le contenu reste "Équipe" | Impossible de configurer les intégrations, le pipeline ou les notifs |
| 4 | Paramètres - Équipe | "Aucun utilisateur" affiché alors que 3 users existent en base | 🟠 Majeur | Aller sur /settings → Équipe | L'admin ne peut pas gérer son équipe |
| 5 | Mon Espace | Affiche 0 mandats actifs, 0 candidats en cours, 0 tâches | 🟠 Majeur | Se connecter → aller sur /mon-espace | Page personnelle inutile, le recruteur ne voit rien de son activité |
| 6 | Dashboard | "71 923 emails non lus" — nombre irréaliste dans le bandeau | 🟠 Majeur | Se connecter → dashboard → bandeau orange en haut | Décrédibilise tout le dashboard. L'utilisateur ne fait plus confiance aux chiffres |
| 7 | Dashboard | Le dashboard scroll sur 1920×1080 (scrollHeight 1080 vs clientHeight 1016) | 🟡 Mineur | Ouvrir le dashboard en 1920×1080 → la zone bottom est partiellement coupée | Contraire au spec "tout sur 1 écran, zéro scroll" |
| 8 | Dashboard responsive | À 1280×720 la colonne Messages+Tâches disparaît complètement | 🟠 Majeur | Redimensionner la fenêtre à 1280×720 | Sur un laptop standard, le recruteur ne voit ni ses messages ni ses tâches |
| 9 | Dashboard responsive | À 768×1024 seul l'Agenda est visible, Mandats et Messages absents | 🟠 Majeur | Utiliser une tablette portrait | Dashboard inutilisable sur tablette |
| 10 | Fiche candidat | Page blanche si l'ID n'existe pas (pas de message d'erreur 404) | 🟡 Mineur | Naviguer vers /candidats/id-inexistant | L'utilisateur voit une page blanche sans comprendre pourquoi |
| 11 | API | Le paramètre `limit` est ignoré dans les endpoints de liste (candidats, clients, mandats) | 🟡 Mineur | Appeler /api/v1/candidats?limit=2 → retourne 20 items | Pas d'impact direct UX mais problème de performance potentiel avec beaucoup de données |
| 12 | Candidats - Filtres | La FilterBar s'affiche en layout vertical (filtres empilés) sur certaines résolutions | 🟡 Mineur | Ouvrir /candidats sur viewport standard | Les filtres prennent trop de place vertical, poussent la liste en bas |
| 13 | Dashboard | Le KPI "CANDIDATS 0 en process" semble incorrect (candidats en pipeline existent) | 🟡 Mineur | Dashboard → vérifier KPI Candidats | Information fausse → décision business erronée |
| 14 | Dashboard | KPIs "APPELS 0/2" et "RDV 0/2" probablement incorrects (Calendar montre 5 events) | 🟡 Mineur | Dashboard → vérifier KPIs Appels et RDV | Contradictions dans les métriques |

---

## 3. UX / DESIGN ISSUES

| # | Page | Problème | Impact | Recommandation |
|---|------|----------|--------|----------------|
| 1 | Sidebar | 14 items de navigation + 2 admin = 16 entrées. Trop dense, dilue l'attention | Le recruteur ne sait pas où cliquer en premier, paralysie du choix | Regrouper : "CRM" (Candidats/Clients/Entreprises), "Recrutement" (Mandats/Séquences/SDR/Adchase), "Pilotage" (Dashboard/Activités/Tâches). Max 8 items visibles |
| 2 | Sidebar | SDR Manager et Adchase sont des features avancées mélangées avec les pages de base | Un junior ne comprendra pas ces labels | Mettre SDR et Adchase dans un sous-menu "Outils" ou un menu secondaire |
| 3 | Dashboard bandeau | Le texte "71923 emails non lus · 2 mandats dormants · 2 taches en retard" est tronqué avec "..." | Information critique coupée | Bandeau scrollable ou résumé plus court ("3 alertes") avec détail au clic |
| 4 | Dashboard | Le label "PIPE PONDERE" est un jargon technique | Un recruteur ne comprend pas ce que c'est | Renommer en "Pipeline estimé" avec tooltip explicatif |
| 5 | Dashboard | Les colonnes ETAPE du tableau Mandats affichent des dots colorés sans légende | Impossible de savoir ce que chaque couleur/dot représente | Ajouter une légende ou des labels texte (S, C, E1, EC, O, P, R) |
| 6 | Fiche candidat | Les boutons "Envoyer un email" et "Planifier un RDV" sont en haut mais le journal d'activité est en bas, séparé par "Détails" et "Tags" | L'action et son résultat sont éloignés visuellement | Déplacer le journal d'activité juste sous les boutons d'action, ou mettre les actions en sticky |
| 7 | Mandats liste | Chaque mandat a un bouton "Kanban" inline dans la table — design inhabituel | Bouton répétitif × 13 mandats, crée du bruit visuel | Mettre le lien Kanban dans la fiche mandat, pas dans chaque ligne de la liste |
| 8 | Notifications | Pas de lien cliquable dans les notifications (ex: "Marcus Tan ajouté" ne link pas vers Marcus Tan) | L'utilisateur lit la notif mais doit chercher manuellement le candidat | Chaque notification devrait être un lien vers l'entité concernée |
| 9 | Création candidat | Le champ "Source" est un select avec uniquement "Sélectionner..." visible — pas clair que c'est un dropdown | L'utilisateur ne comprend pas comment indiquer la source | Ajouter un placeholder explicite ("LinkedIn, Cooptation, Candidature...") |
| 10 | Toutes les listes | Pas de tri visible sur les colonnes (pas de flèches up/down sur les headers) | L'utilisateur ne sait pas si/comment trier | Ajouter des flèches de tri interactives sur chaque colonne |
| 11 | Dashboard | Absence de bouton "Rafraîchir" pour forcer le rechargement des données | Si les données semblent stale, l'utilisateur doit F5 toute la page | Ajouter un bouton refresh discret |
| 12 | Global | Aucun raccourci clavier documenté ou visible sauf Ctrl+K | Perte de productivité pour les power users | Ajouter un menu "?" avec les raccourcis, comme Notion ou Linear |

---

## 4. FEATURES MANQUANTES (classées par priorité)

| # | Feature | Pourquoi c'est nécessaire | Effort | Priorité |
|---|---------|--------------------------|--------|----------|
| 1 | **Suppression d'entités** (candidat, client, entreprise) | Impossible de supprimer un candidat/client erroné. Pas de bouton supprimer visible sur les fiches | S | P0 |
| 2 | **Modification inline des fiches** | Les fiches candidat/client/entreprise n'ont pas de bouton "Modifier". On ne peut que voir les infos | M | P0 |
| 3 | **Drag & drop Kanban** | Le Kanban affiche les colonnes mais le déplacement de candidats entre étapes n'est pas testable (aucun candidat dans le pipe du mandat testé) | M | P0 |
| 4 | **Envoi d'emails depuis l'app** | Le bouton "Envoyer un email" existe mais sans intégration SMTP/Gmail en envoi, c'est un placeholder | L | P1 |
| 5 | **Reporting/Export** | Aucune possibilité d'exporter un rapport client, un suivi de mandat, ou des KPIs en PDF/Excel | M | P1 |
| 6 | **Historique des modifications** | Pas d'audit log visible. Si un recruteur modifie une fiche, personne ne sait quand/quoi | M | P1 |
| 7 | **Gestion des doublons** | Pas de détection de doublons à la création (même email = 2 fiches possibles) | M | P1 |
| 8 | **Rôles et permissions granulaires** | Seul le rôle ADMIN existe. Pas de RECRUTEUR avec droits limités, pas de MANAGER | L | P1 |
| 9 | **Upload de CV/documents** | Pas de possibilité d'attacher un CV PDF à une fiche candidat | M | P1 |
| 10 | **Pipeline client** | Le bouton "Pipeline" existe sur la liste Clients mais le parcours commercial (Lead→Prospect→Client→Récurrent) n'est pas exploitable | M | P2 |
| 11 | **Rappels/alertes automatiques** | Pas de rappel automatique quand un mandat est dormant depuis X jours | M | P2 |
| 12 | **Multi-devise** | Le select EUR(€) existe dans les settings mais pas de gestion multi-devise réelle | S | P3 |
| 13 | **Dark mode** | Pas de thème sombre | S | P3 |
| 14 | **App mobile / PWA** | Aucune version mobile. Un recruteur en déplacement ne peut pas consulter ses RDV | XL | P3 |

---

## 5. ANALYSE CONCURRENTIELLE

| Feature | HumanUp | Recruiterflow | Bullhorn | Leonar | RecruitCRM |
|---------|---------|---------------|----------|--------|------------|
| ATS (pipeline candidats) | ✅ Basique | ✅ Complet | ✅ Complet | ✅ Complet | ✅ Complet |
| CRM (gestion clients) | ✅ Bon | ✅ Bon | ✅ Excellent | ⚠️ Basique | ✅ Bon |
| Kanban | ✅ Présent | ✅ Drag&drop | ✅ Drag&drop | ✅ Drag&drop | ✅ Drag&drop |
| Séquences multicanal | ✅ Innovant | ✅ Email only | ❌ | ✅ Email+LinkedIn | ⚠️ Email only |
| Intégration Gmail | ✅ Lecture | ✅ Bi-directionnel | ✅ Complet | ✅ Complet | ✅ Complet |
| Intégration Calendar | ✅ Lecture | ✅ Bi-directionnel | ✅ Complet | ⚠️ Basique | ✅ Complet |
| SDR / Power Dialer | ✅ Innovant | ❌ | ⚠️ Add-on | ❌ | ❌ |
| Adchase (push candidat) | ✅ Unique | ❌ | ❌ | ❌ | ❌ |
| Extension Chrome/LinkedIn | ❌ Absent | ✅ Complet | ✅ Complet | ✅ Complet | ✅ Complet |
| Reporting/Analytics | ⚠️ Dashboard only | ✅ Complet | ✅ Excellent | ✅ Bon | ✅ Complet |
| Mobile | ❌ | ✅ App | ✅ App | ⚠️ PWA | ✅ App |
| Marketplace/Intégrations | ⚠️ Gmail+Calendar | ✅ 20+ | ✅ 50+ | ✅ 15+ | ✅ 25+ |
| Onboarding/aide | ❌ | ✅ Bon | ⚠️ Complexe | ✅ Excellent | ✅ Bon |

**Avantage compétitif potentiel :** SDR Manager + Adchase + Séquences multicanal (email/call/WhatsApp). Aucun concurrent ne propose les 3 ensemble. C'est le triangle offensif pour un cabinet de recrutement orienté business development.

**Gap le plus critique :** Absence d'extension Chrome/LinkedIn. C'est la source #1 de candidats pour 90% des cabinets. Sans ça, le recruteur alterne entre LinkedIn et l'ATS en copier-coller.

---

## 6. RECOMMANDATIONS PRODUCT (Top 10 priorisées)

### 1. 🔴 Fixer les 3 bugs critiques (Tâches, Paramètres, Mon Espace)
**Justification :** Un recruteur utilise Tâches et Mon Espace quotidiennement. Si ces pages sont cassées, il retourne sur ses post-its ou son Excel.
**Effort :** 1 jour

### 2. 🔴 Corriger le responsive dashboard pour 1440px et 1280px
**Justification :** 60% des laptops sont en 1440×900 ou 1366×768. Le dashboard est la page d'accueil — s'il est cassé, la première impression est ruinée.
**Effort :** 1-2 jours

### 3. 🟠 Ajouter l'édition inline des fiches (candidat, client, entreprise, mandat)
**Justification :** On peut créer mais pas modifier. C'est un deal-breaker absolu pour un outil de travail quotidien.
**Effort :** 3-4 jours

### 4. 🟠 Fiabiliser les KPIs du dashboard
**Justification :** Si le dashboard affiche des chiffres faux (71k emails, 0 candidats en process), personne ne le consultera. Le dashboard doit être la source de vérité.
**Effort :** 2 jours

### 5. 🟠 Ajouter la suppression avec confirmation
**Justification :** Pas de CRUD complet sans le D. Un recruteur qui crée un doublon par erreur est bloqué.
**Effort :** 1 jour

### 6. 🟡 Implémenter le drag & drop Kanban
**Justification :** Le Kanban est le coeur du workflow recrutement. Sans drag & drop, il n'est qu'un affichage passif.
**Effort :** 2-3 jours

### 7. 🟡 Développer l'extension Chrome/LinkedIn
**Justification :** C'est le gap concurrentiel #1. Le recruteur passe 60% de son temps sur LinkedIn. Chaque candidat intéressant doit pouvoir être importé en 1 clic.
**Effort :** 2-3 semaines

### 8. 🟡 Ajouter les exports (PDF rapport client, CSV liste candidats)
**Justification :** Le directeur de cabinet a besoin de montrer l'avancement à ses clients. Sans reporting exportable, il utilise Excel à côté.
**Effort :** 3-4 jours

### 9. ⚪ Réorganiser la sidebar (grouper les 16 items en 3-4 sections)
**Justification :** Trop d'items = cognitive overload. Un nouveau recruteur est perdu.
**Effort :** 1 jour

### 10. ⚪ Ajouter un onboarding / guide contextuel
**Justification :** Un recruteur junior doit pouvoir se former seul. Aujourd'hui, zéro aide in-app.
**Effort :** 3-5 jours

---

## 7. ROADMAP SUGGÉRÉE

### Sprint 1 (Semaine 1) — Bug Fixes Critiques
- [ ] Fix page Tâches : changer l'endpoint de `/activites/taches` vers `/taches` (ligne 60 de taches/index.tsx)
- [ ] Fix Paramètres : corriger le state management des onglets (tabs ne switchent pas)
- [ ] Fix Mon Espace : vérifier l'endpoint `/dashboard/recruteur` et le mapping des données
- [ ] Fix bandeau emails : plafonner/vérifier le count Gmail ou afficher "Boîte de réception" au lieu du nombre brut
- [ ] Fix page blanche sur ID inexistant : ajouter un error boundary et un message 404 propre
- [ ] Corriger le responsive dashboard 1440px et 1280px (media queries CSS)
- [ ] Vérifier et corriger les KPIs (candidats en process, appels, RDV)

### Sprint 2 (Semaine 2) — UX Quick Wins
- [ ] Ajouter l'édition inline sur les fiches candidat/client/entreprise/mandat
- [ ] Ajouter la suppression avec modal de confirmation
- [ ] Réorganiser la sidebar (groupes avec sections)
- [ ] Ajouter les flèches de tri sur les colonnes des listes
- [ ] Rendre les notifications cliquables (lien vers l'entité)
- [ ] Fix le layout FilterBar pour qu'il reste horizontal
- [ ] Ajouter un empty state plus utile sur les pages vides (Templates, etc.)

### Sprint 3-4 (Semaines 3-4) — Features P0
- [ ] Implémenter le drag & drop Kanban (react-beautiful-dnd ou @dnd-kit)
- [ ] Ajouter l'upload de CV/documents sur les fiches candidat
- [ ] Implémenter l'envoi d'emails via Gmail API (pas juste la lecture)
- [ ] Ajouter la détection de doublons (email/téléphone) à la création
- [ ] Export CSV fonctionnel sur les listes (bouton déjà présent dans SelectionBar)

### Mois 2 — Features P1
- [ ] Extension Chrome pour LinkedIn (import candidat en 1 clic)
- [ ] Reporting client : PDF avec pipeline, activités, timeline
- [ ] Permissions granulaires (RECRUTEUR vs MANAGER vs ADMIN)
- [ ] Rappels automatiques (mandat dormant, tâche en retard, relance client)
- [ ] Historique des modifications / audit log

### Mois 3 — Features P2
- [ ] Pipeline commercial client (Lead → Prospect → Client → Récurrent)
- [ ] Dashboard admin avancé (comparaison recruteurs, objectifs, forecasting)
- [ ] Intégration WhatsApp Business API pour les séquences
- [ ] Mode sombre
- [ ] PWA pour consultation mobile

---

## ANNEXE : Tests détaillés effectués

### Pages visitées (14/14)
✅ Dashboard | ✅ Mon Espace | ✅ Candidats (liste + détail) | ✅ Clients (liste + détail) | ✅ Entreprises (liste + détail) | ✅ Mandats (liste + détail + Kanban) | ✅ SDR Manager | ✅ Adchase | ✅ Activités | ✅ Tâches | ✅ Séquences | ✅ Templates | ✅ Notifications | ✅ Import | ✅ Paramètres (5 onglets)

### CRUD testés
- ✅ Créer un candidat (Jean TestAudit) → apparaît dans la liste (31 candidats)
- ✅ Créer une entreprise (AuditCorp) → fiche créée avec stats
- ✅ Validation formulaire client (entreprise requise) → fonctionne
- ✅ Validation formulaire mandat (entreprise + client requis) → fonctionne
- ❌ Modifier un candidat → pas de bouton d'édition trouvé
- ❌ Supprimer un candidat → pas de bouton de suppression trouvé

### Recherche
- ✅ Recherche dans la liste candidats → fonctionne
- ✅ Recherche globale (header) → dropdown résultats fonctionne
- ❌ Ctrl+K raccourci → ne déclenche pas la modale de recherche

### Responsive testé
- ✅ 1920×1080 → OK (léger scroll en bas)
- ⚠️ 1440×900 → Acceptable (chart + calendrier débordent)
- ❌ 1280×720 → Colonne Messages+Tâches disparaît
- ❌ 768×1024 → 2 colonnes sur 3 absentes

### API testées
- ✅ GET /candidats → 200 (20 items)
- ✅ GET /clients → 200 (20 items)
- ✅ GET /mandats → 200 (13 items)
- ✅ GET /taches → 200 (15 items)
- ✅ GET /dashboard/spa → 200 (toutes sections)
- ✅ GET /sdr/dashboard → 200
- ✅ GET /sequences → 200 (5 templates)
- ❌ GET /activites/taches → 404
