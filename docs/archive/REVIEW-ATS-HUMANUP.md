# REVIEW COMPLÈTE — HumanUp ATS/CRM
### Audit réalisé le 10 mars 2026
### Perspective : Headhunter senior, cabinet de chasse au succès, fee 20-22%

---

## 1. PREMIER ÉCRAN DU MATIN — Dashboard

**Résumé : ✅ 5 | ⚠️ 3 | ❌ 2 | 💡 3**

```
✅ Actions prioritaires visibles au matin
→ Bandeau d'alertes intelligent en haut : emails non lus, mandats dormants (>7j sans activité),
  tâches en retard, réponses séquences. C'est exactement ce qu'un recruteur veut voir en ouvrant l'app.

✅ Revenue potentiel dans le pipe visible
→ KPI "CA pondéré" avec calcul probabiliste par stage (SOURCING 10%, CONTACTE 20%, ENTRETIEN_CLIENT 60%,
  OFFRE 80%, etc.). Formule : Σ(fee mandat × probabilité stage). Excellent.

✅ Mandats inactifs flaggés automatiquement
→ Alerte "mandats dormants" détecte les mandats actifs sans activité depuis 7 jours.
  Visible dans le bandeau + widget dédié.

✅ KPIs variés et pertinents
→ CA réalisé, appels Allo, RDV calendrier, pipe pondéré, graphique activité hebdo,
  graphique revenue mensuel, mini-kanban mandats. Bon coverage.

✅ Mini-kanban mandats sur le dashboard
→ Affiche les mandats actifs par statut avec nombre de candidats par stage.
  Vision instantanée du pipe sans quitter le dashboard.

⚠️ Pas de classement mandats par urgence/probabilité
→ Les mandats sont listés mais pas triés par urgence ou probabilité de closing.
  Un recruteur senior veut voir en premier le mandat le plus proche du placement.
→ Recommandation : Ajouter un tri par "weighted pipeline value" ou "jours restants avant deadline". Priorité HAUTE.

⚠️ Pas de "santé" par mandat (vue rapide)
→ Le mini-kanban montre le nombre de candidats, mais pas un indicateur synthétique
  (nombre de candidats actifs vs attendus, dernier mouvement, prochaine action prévue).
→ Recommandation : Badge santé (🟢🟡🔴) par mandat basé sur : candidats actifs, dernière activité,
  deadline. Priorité MOYENNE.

⚠️ Pas de mise à jour temps réel
→ Le dashboard est chargé au mount (SPA data en un seul call). Si un email arrive
  pendant que tu consultes, pas de refresh automatique. Il faut F5.
→ Recommandation : WebSocket ou polling toutes les 60s pour les alertes critiques. Priorité HAUTE.

❌ Pas d'alerte candidats en attente trop longtemps
→ Aucune détection de candidats "bloqués" dans un stage depuis X jours.
  Un candidat en "Entretien Client" depuis 2 semaines sans mouvement = deal qui meurt en silence.
→ Recommandation : Alerte configurable "candidat en stage > X jours" avec notification. Priorité CRITIQUE.

❌ Pas de morning briefing auto-généré
→ Le dashboard montre les données mais ne synthétise pas. Un résumé IA type
  "3 actions prioritaires aujourd'hui : relancer X, préparer Y, closer Z" serait du game-changer.
→ Recommandation : Endpoint IA /ai/morning-briefing qui génère un résumé des priorités du jour. Priorité HAUTE.

💡 Revenue forecast non temps réel
→ Le forecast est calculé au chargement. Chaque mouvement de kanban devrait recalculer
  instantanément le forecast visible sur le dashboard.

💡 Pas de widget "candidats chauds"
→ Les candidats en fin de pipe (OFFRE, NEGOCIATION) devraient avoir un widget dédié
  "Closings imminents" avec countdown.

💡 Pas de comparaison période (semaine vs semaine précédente)
→ Les KPIs montrent les valeurs absolues mais pas la tendance. "+15% d'appels vs semaine dernière"
  motive et aide à piloter.
```

---

## 2. GESTION DES CANDIDATS

**Résumé : ✅ 7 | ⚠️ 4 | ❌ 3 | 💡 2**

```
✅ Création candidat rapide
→ Bouton "Nouveau candidat" accessible depuis la liste, formulaire complet avec parsing CV IA.
  Flow : clic → formulaire → upload CV → IA pré-remplit → sauvegarder. ~4-5 clics.

✅ Parsing CV fonctionnel
→ Endpoint /ai/parse-cv qui extrait nom, prénom, email, téléphone, titre, compétences,
  expériences, éducation depuis un CV uploadé. Pré-remplit le formulaire.

✅ Kanban avec logging automatique des changements de stage
→ Chaque déplacement dans le kanban crée automatiquement un StageHistory + Activite.
  Le recruteur n'a rien à faire manuellement. Excellent.

✅ Historique complet sur une seule fiche
→ La fiche candidat [id].tsx regroupe : infos perso, tags, expériences, activités/journal
  (appels, emails, notes, stage changes), documents, candidatures actives. Tout en un.

✅ Assignation multi-mandats
→ Bouton "Ajouter au mandat" depuis la fiche candidat. Un candidat peut être sur plusieurs
  mandats simultanément via le système de Candidature.

✅ TagPicker fonctionnel
→ Tags libres + suggestions, ajout par Enter/virgule, suppression par Backspace.
  UX fluide pour tagger les compétences.

✅ Recherche globale Ctrl+K
→ Recherche candidats/clients/entreprises/mandats depuis n'importe où. Bien.

⚠️ Recherche limitée (substring, 5 résultats)
→ La recherche globale utilise Prisma `contains` (LIKE %term%). Pas de full-text search,
  pas de fuzzy matching. 5 résultats max par entité. Chercher "dev react paris" ne matchera
  que si c'est dans le même champ.
→ Recommandation : PostgreSQL full-text search (ts_vector) ou ElasticSearch.
  Objectif < 500ms, 20+ résultats, recherche multi-champs. Priorité CRITIQUE.

⚠️ Bulk actions candidats incomplètes
→ La sélection bulk fonctionne (checkbox + SelectionBar) mais les actions Email/Séquence/Stage
  affichent "bientôt disponible". Seul Export CSV fonctionne.
→ Recommandation : Implémenter le bulk stage change en priorité (50% des cas d'usage bulk). Priorité HAUTE.

⚠️ Pas de note vocale / transcription rapide
→ Le recruteur sort d'un call et veut dicter ses notes. Pas d'input vocal.
→ Recommandation : Bouton micro → Web Speech API ou Whisper → transcription auto. Priorité MOYENNE.

⚠️ Pas de dédoublonnage au moment de la création
→ Si je crée un candidat avec un email déjà en base, pas de warning.
  Le email-auto-create crée aussi des contacts automatiquement → risque de doublons.
→ Recommandation : Check email + LinkedIn URL + (nom+prénom) avant INSERT.
  Afficher le candidat existant si match. Priorité HAUTE.

❌ Chrome Extension non existante dans le codebase
→ Aucun dossier /extension ou /chrome-extension dans le projet.
  La création candidat depuis LinkedIn en 1 clic est impossible.
→ Recommandation : Développer une Chrome Extension v3 avec manifest.json.
  Parse LinkedIn → POST /candidats. Priorité CRITIQUE (adoption).

❌ Pas d'auto-tagging compétences depuis CV
→ Le parsing CV extrait du texte mais ne génère pas de tags structurés automatiquement.
  Le recruteur doit tagger manuellement.
→ Recommandation : Ajouter au prompt de parsing CV la génération de tags standardisés. Priorité MOYENNE.

❌ Pas de rappel automatique si pas de contact depuis X jours
→ Un candidat sourcé il y a 10 jours sans aucun contact = oubli. Aucune alerte.
→ Recommandation : Cron job qui détecte les candidats actifs (en candidature) sans activité
  depuis X jours → crée une tâche de relance. Priorité HAUTE.

💡 Scoring IA des candidats par mandat
→ Quand on ajoute un candidat à un mandat, l'IA pourrait donner un score de matching
  basé sur la scorecard du mandat vs le profil du candidat.

💡 Timeline visuelle type LinkedIn
→ L'historique est en liste. Une timeline verticale avec icons par type serait plus scannable.
```

---

## 3. GESTION DES MANDATS / DEALS

**Résumé : ✅ 7 | ⚠️ 3 | ❌ 2 | 💡 2**

```
✅ Kanban candidats par mandat (vue mission)
→ Page /mandats/[id]-kanban avec 7 stages (SOURCING → PLACE). Drag & drop @dnd-kit.
  Refusal modal avec motif. Compteur candidats par stage. Excellent.

✅ Brief du mandat accessible depuis le kanban
→ Lien direct vers la fiche mandat depuis le header du kanban. 1 clic.

✅ Fee auto-calculé
→ Fee estimé = salaireMax × feePourcentage / 100. Affiché sur la fiche mandat
  dans la section Facturation. Calcul automatique.

✅ Nombre de candidats par stage visible
→ Le kanban affiche le count par colonne. La fiche mandat résume aussi les stats pipeline.

✅ Pipeline mandats avec statuts
→ Statuts : OUVERT, EN_COURS, GAGNE, PERDU, ANNULE, CLOTURE.
  + Vue kanban par statut sur /mandats/kanban.

✅ Scorecard IA
→ Depuis la fiche mandat : coller un transcript + fiche de poste → IA génère scorecard
  (compétences clés, critères techniques, questions d'entretien, red flags). Éditable.

✅ Facturation intégrée
→ Section facturation sur la fiche mandat : fee %, fee estimé, fee facturé,
  statut facturation, date facturation. Revenue tracké.

⚠️ Pas de clonage de mandat
→ Pour un client récurrent qui donne le même type de mandat, il faut tout re-saisir.
→ Recommandation : Bouton "Dupliquer" qui copie brief, client, fee, secteur. 2 clics. Priorité MOYENNE.

⚠️ Sorting client-side sur la liste mandats
→ Contrairement aux candidats (server-side), les mandats trient en client-side.
  Problème de performance si > 100 mandats.
→ Recommandation : Migrer vers server-side sorting comme pour les candidats. Priorité BASSE.

⚠️ Pas de date de closing estimée avec alerte
→ Pas de champ "deadline" ou "date de closing estimée" sur le mandat.
  Impossible de savoir si on dépasse le délai.
→ Recommandation : Ajouter champ dateClosingEstimee + alerte si dépassée. Priorité HAUTE.

❌ Time-to-fill non calculé automatiquement
→ Pas de KPI time-to-fill (date ouverture → date placement). Pourtant c'est LE KPI opérationnel.
→ Recommandation : Calculer automatiquement depuis dateCreation mandat → date du premier candidat
  en stage PLACE. Afficher sur la fiche mandat + stats. Priorité HAUTE.

❌ Pas de filtres avancés (secteur, séniorité, localisation)
→ Les filtres mandats sont basiques : statut + priorité. Pas de filtre par client, secteur,
  localisation, range salaire. Pour un recruteur avec 30 mandats c'est insuffisant.
→ Recommandation : Ajouter FilterBar complet comme sur les candidats. Priorité HAUTE.

💡 Revenue cumulé par client auto-calculé
→ Le revenue par mandat est tracké, mais pas l'agrégation par client/entreprise visible.

💡 Alerte si mandat > 30 jours sans shortlist
→ Seule l'alerte "dormant 7 jours" existe. Pas d'alerte business
  "aucun candidat présenté au client depuis 30 jours".
```

---

## 4. GESTION DES CLIENTS & ENTREPRISES

**Résumé : ✅ 5 | ⚠️ 3 | ❌ 3 | 💡 1**

```
✅ Fiche client complète
→ Page /clients/[id].tsx est l'une des meilleures pages : infos, mandats liés,
  activités, pipeline candidats par client (kanban). Excellente page.

✅ Pipeline commercial client
→ Le client a un champ "pipeline" avec stages visuels.
  Page /clients/pipeline avec drag & drop @hello-pangea/dnd.

✅ Mandats liés visibles sur la fiche entreprise
→ Les mandats d'une entreprise sont accessibles depuis la fiche entreprise.

✅ Création rapide depuis formulaire mandat
→ Bouton "+" à côté du select Entreprise/Client pour créer inline sans quitter le formulaire. UX bien pensée.

✅ Rôles contacts structurés
→ Champ "fonction" sur le client permet de distinguer DRH, Hiring Manager, etc.

⚠️ Actions bulk clients = placeholders
→ La sélection checkbox fonctionne mais Email/Relance/Export sont des console.log vides.
→ Recommandation : Implémenter au minimum l'export CSV. Priorité HAUTE.

⚠️ Export CSV entreprises = placeholder
→ Le bouton export CSV existe visuellement mais ne fait rien (console.log).
→ Recommandation : Implémenter comme pour les candidats. Priorité MOYENNE.

⚠️ Pas de fee moyen / délai paiement / nb placements par client
→ Les stats client individuelles ne sont pas calculées.
  Le recruteur ne sait pas qui sont ses "meilleurs" clients en un coup d'œil.
→ Recommandation : Ajouter au header de la fiche client : fee moyen, nombre de placements,
  revenue cumulé, délai paiement moyen. Priorité HAUTE.

❌ Pas de score client automatique
→ Pas de scoring basé sur : revenue cumulé, nombre de mandats, taux de conversion, délai de paiement.
  Un "A-client" vs un "C-client" devrait être visible immédiatement.
→ Recommandation : Score automatique calculé + badge visible (A/B/C ou 🟢🟡🔴). Priorité MOYENNE.

❌ Pas d'alerte relance client inactif
→ Un client récurrent qui ne donne pas de mandat depuis 3 mois = il est parti chez un concurrent.
  Aucune alerte.
→ Recommandation : Cron qui détecte les clients "récurrents" (≥2 mandats historiques) sans mandat
  actif depuis X mois → crée une tâche de relance. Priorité HAUTE.

❌ Pas de revenue historique par entreprise visible en 1 clic
→ Le revenue est tracké par mandat mais pas agrégé sur la fiche entreprise.
  "Combien ce client m'a rapporté depuis le début ?" = requête manuelle.
→ Recommandation : Ajouter stats revenue en header de la fiche entreprise. Priorité HAUTE.

💡 Client CRM scoring + next best action
→ L'IA pourrait suggérer "Ce client a un historique de 3 mandats/an,
  le dernier date de 4 mois → action : appeler pour prendre la température".
```

---

## 5. ACTIVITÉS & JOURNAL

**Résumé : ✅ 5 | ⚠️ 2 | ❌ 2 | 💡 1**

```
✅ Appels Allo se loggent automatiquement
→ Webhook Allo → auto-création Activite avec durée, direction, timestamp.
  Rattachement automatique au candidat/client via phone matching. Excellent.

✅ Emails Gmail loggés automatiquement
→ Sync Gmail bidirectionnelle. Les emails envoyés/reçus via l'ATS ou Gmail direct
  sont rattachés aux fiches. Auto-création de contacts depuis les emails entrants.

✅ Changements de stage loggés automatiquement
→ Chaque mouvement kanban → Activite créée avec type CHANGEMENT_STAGE.
  StageHistory aussi créé. Zéro action du recruteur.

✅ RDV Calendar synchronisés
→ Google Calendar + Calendly parsing. Les RDV apparaissent dans le journal.

✅ Notes manuelles faciles
→ Zone de note sur chaque fiche entité. Ajout rapide.

⚠️ Pas de filtre date-range sur le journal activités
→ La page /activites liste tout mais pas de filtre par plage de dates.
  Impossible de voir "toutes les activités de la semaine dernière".
→ Recommandation : Ajouter un DateRangePicker dans les filtres. Priorité MOYENNE.

⚠️ Pas de raccourci clavier pour ajouter une note
→ Objectif < 5 secondes pour ajouter une note. Actuellement il faut naviguer
  vers la fiche puis scroller jusqu'au journal.
→ Recommandation : Raccourci global "N" → modal quick-note avec autocomplete entité. Priorité MOYENNE.

❌ Pas de résumé IA auto-généré après chaque call
→ L'IA peut résumer un call (endpoint /ai/call-summary existe) mais ce n'est pas automatique.
  Le recruteur doit coller le transcript manuellement.
→ Recommandation : Connecter Allo recording → transcription auto → IA résumé →
  Activité créée avec résumé + points clés. Priorité HAUTE.

❌ Pas de création automatique de tâche de suivi après un call
→ Après chaque call, le recruteur devrait avoir une tâche "Relancer dans 3 jours"
  créée automatiquement. Actuellement : néant.
→ Recommandation : Post-call hook → IA suggère next action → crée tâche. Priorité HAUTE.

💡 Import transcripts Gemini depuis Google Docs
→ L'API Google Docs n'est pas intégrée. Les transcripts doivent être copiés manuellement.
```

---

## 6. TÂCHES & RELANCES

**Résumé : ✅ 2 | ⚠️ 2 | ❌ 5 | 💡 1**

> ⚠️ **Section la plus faible de l'application.** Les tâches sont le nerf de la guerre pour un recruteur — ne jamais oublier une relance est vital. Cette section nécessite un refactoring majeur.

```
✅ Vue tâches centralisée
→ Page /taches avec tabs A faire / En retard / Terminées.
  Liste les tâches avec entité liée, date d'échéance, statut.

✅ Tâches liées aux entités
→ Chaque tâche (Activite isTache=true) est liée à un candidat, client, mandat
  via entiteType/entiteId. Navigation vers l'entité en 1 clic.

⚠️ Dashboard widget tâches basique
→ Le widget tâches du dashboard montre les tâches du jour mais sans priorisation.
  Pas de distinction "critique" vs "nice-to-have".
→ Recommandation : Ajouter un attribut priorité aux tâches. Priorité HAUTE.

⚠️ Pas de snooze en 1 clic
→ Pour reporter une tâche, il faut l'ouvrir et changer la date.
  Un bouton "Snooze +1j / +3j / +1sem" serait instantané.
→ Recommandation : Dropdown snooze sur chaque tâche dans la liste. Priorité MOYENNE.

❌ CRITIQUE : Impossible de créer une tâche depuis la page /taches
→ Le bouton "Nouvelle tache" a un onClick VIDE. Pas de handler, pas de modal.
  C'est un DEAL BREAKER. Le recruteur ne peut pas créer une tâche de relance manuellement
  depuis la page centrale des tâches.
→ Recommandation : Implémenter le modal de création de tâche IMMÉDIATEMENT. Priorité CRITIQUE.

❌ Pas de tâches auto-créées au changement de stage
→ Quand un candidat passe en "Entretien" le système devrait créer "Préparer le candidat"
  et "Envoyer le brief au client". Rien n'est fait.
→ Recommandation : Configurer des task templates par stage. À chaque transition de stage →
  création automatique des tâches associées. Priorité CRITIQUE.

❌ Pas de tâches récurrentes
→ "Relancer le client Acme tous les mois" = impossible.
  Le recruteur doit recréer manuellement chaque mois.
→ Recommandation : Modèle RecurringTask + cron qui génère les instances. Priorité HAUTE.

❌ Pas d'édition de tâche existante
→ Le service tâches (tache.service.ts) n'a pas de méthode update().
  On peut créer et compléter, mais pas modifier (changer la date, le texte, réassigner).
→ Recommandation : Ajouter CRUD complet sur les tâches. Priorité CRITIQUE.

❌ Pas de notifications pour tâches en retard
→ Les tâches en retard sont visibles dans l'onglet mais aucune notification push/email/Telegram.
→ Recommandation : Cron job + notification par email/in-app quand une tâche dépasse sa deadline.
  Priorité HAUTE.

💡 IA suggestion de prochaines actions
→ Basé sur le contexte du mandat (stage des candidats, dernière activité),
  l'IA pourrait suggérer les 3 prochaines actions à faire.
```

---

## 7. COMMUNICATIONS (Email, Appels, RDV)

**Résumé : ✅ 6 | ⚠️ 3 | ❌ 2 | 💡 1**

```
✅ Email depuis la fiche candidat/client
→ EmailComposer intégré dans la fiche candidat. Send via Gmail API sans quitter l'ATS.

✅ Templates email avec variables
→ Système de templates avec variables {{prenom}}, {{poste}}, {{entreprise}}.
  Rendu via POST /templates/:id/render.

✅ Appel Allo en 1 clic
→ Bouton "Appeler" qui lance l'appel via Allo API directement depuis la fiche.

✅ RDV depuis l'ATS
→ ScheduleMeeting component avec intégration Google Calendar.
  Crée le RDV + rattache à l'entité.

✅ Sync bidirectionnelle Gmail
→ Les emails envoyés via Gmail direct sont récupérés et rattachés
  aux fiches automatiquement.

✅ Séquences email semi-automatiques
→ Adchase + Séquences créent des tâches par étape. Chaque email doit être validé
  par le recruteur avant envoi. Semi-auto = sécurité.

⚠️ Templates pas accessibles depuis Adchase
→ La section templates dans Adchase n'est pas intégrée. Le bouton existe
  mais ne charge pas les templates depuis /templates.
→ Recommandation : Intégrer le template picker dans Adchase Step 2. Priorité HAUTE.

⚠️ Pas de tracking email (open/click)
→ Aucun tracking pour savoir si le client a ouvert l'email de présentation candidat.
  Le recruteur envoie dans le vide sans feedback.
→ Recommandation : Pixel tracking pour opens, link wrapping pour clicks. Priorité HAUTE.

⚠️ Pas de pièces jointes
→ Le système email ne gère pas les attachments. Impossible d'envoyer un CV en PJ.
→ Recommandation : Ajouter support attachments (CV du candidat, brief mandat). Priorité HAUTE.

❌ Pas de sync bidirectionnelle Calendar complète
→ Les RDV créés dans Google Calendar directement ne sont pas toujours importés.
  Calendly est parsé mais de manière limitée.
→ Recommandation : Webhook Google Calendar push notifications. Priorité MOYENNE.

❌ Pas de scheduling email (envoyer plus tard)
→ Impossible de programmer un email pour envoi à une heure précise.
  Un email de présentation envoyé le mardi matin à 9h a plus d'impact que le vendredi à 17h.
→ Recommandation : Champ datetime + cron d'envoi différé. Priorité MOYENNE.

💡 Email tracking + relance auto si pas d'ouverture
→ Si l'email n'est pas ouvert après 3 jours → créer automatiquement une tâche "Relancer par téléphone".
```

---

## 8. REPORTING & ANALYTICS

**Résumé : ✅ 5 | ⚠️ 3 | ❌ 2 | 💡 1**

```
✅ KPIs principaux trackés
→ Page /stats complète : revenue, placements, mandats actifs/gagnés/perdus,
  activités par type, pipeline par stage, conversion rates. Bon coverage.

✅ Revenue YTD visible
→ Le dashboard montre le CA réalisé + graphique revenue mensuel.
  La page stats approfondit.

✅ Stats par recruteur (si mode team)
→ L'admin peut voir les stats individuelles des recruteurs.
  classement par revenue, placements, activités.

✅ Nombre d'activités par jour/semaine
→ Graphique weekly activity sur le dashboard.
  Détail par type (appels, emails, notes) sur la page stats.

✅ Conversion par stage
→ Funnel conversion visible : combien de candidats passent de chaque stage au suivant.
  Taux de conversion calculé automatiquement.

⚠️ Reports HTML uniquement, pas de PDF/Excel export
→ La page /reports génère des rapports client et mandat en HTML.
  Pas de bouton export PDF/Excel. Pour un board meeting c'est insuffisant.
→ Recommandation : Ajouter export PDF (puppeteer/html-to-pdf) + Excel (xlsx). Priorité HAUTE.

⚠️ Selects natifs dans les reports
→ Les dropdowns de la page reports utilisent <select> natif au lieu du composant Select custom.
  Incohérence UX.
→ Recommandation : Remplacer par le composant Select searchable. Priorité BASSE.

⚠️ Pas de caching sur les stats
→ Les requêtes stats sont lourdes (aggregations Prisma sur tout l'historique).
  Pas de cache. Si 10 recruteurs ouvrent les stats simultanément = charge DB.
→ Recommandation : Redis cache avec TTL 5 min pour les aggregations. Priorité MOYENNE.

❌ Pas de rapport hebdomadaire auto-envoyé
→ L'admin doit aller sur /reports manuellement. Pas d'envoi automatique par email.
→ Recommandation : Cron hebdomadaire → génère rapport → envoie par email à l'admin. Priorité MOYENNE.

❌ Time-to-fill moyen non calculé
→ Le time-to-fill (métrique opérationnelle #1) n'est calculé nulle part dans les stats.
→ Recommandation : Ajouter comme KPI principal sur la page stats. Priorité HAUTE.

💡 Alertes KPI sous seuil
→ Si un recruteur fait moins de 20 appels/semaine, alerte automatique.
  Les KPIs sans seuil sont des métriques passives.
```

---

## 9. CHROME EXTENSION

**Résumé : ✅ 0 | ⚠️ 0 | ❌ 5 | 💡 0**

> ⚠️ **Section entièrement absente.** Pas de Chrome Extension dans le codebase. C'est un deal breaker pour l'adoption : les recruteurs sourcent sur LinkedIn, l'extension est le pont entre LinkedIn et l'ATS.

```
❌ CRITIQUE : Pas de Chrome Extension
→ Aucun dossier extension/ dans le projet. L'import LinkedIn se fait manuellement.
→ Recommandation : Développer une extension Chrome v3. Priorité CRITIQUE.

❌ Pas de création candidat depuis LinkedIn
→ Le recruteur doit copier-coller les infos LinkedIn dans le formulaire candidat.
→ Recommandation : Extension parse le DOM LinkedIn → POST /candidats. 1 clic.

❌ Pas de détection doublon en temps réel
→ En naviguant sur LinkedIn, impossible de savoir si un profil est déjà en base.
→ Recommandation : Badge visuel "Déjà en base" sur les profils LinkedIn.

❌ Pas d'ajout direct à un mandat
→ Impossible d'ajouter un candidat LinkedIn directement à un mandat depuis l'extension.
→ Recommandation : Select mandat dans le popup extension → create + assign en 1 action.

❌ Pas de création entreprise depuis LinkedIn Company
→ Les pages entreprise LinkedIn ne sont pas exploitées.
→ Recommandation : Parse LinkedIn Company → POST /entreprises.
```

---

## 10. INTÉGRATIONS & API

**Résumé : ✅ 5 | ⚠️ 3 | ❌ 2 | 💡 1**

```
✅ Allo VoIP fonctionnel
→ Webhooks call.started, call.ended. Auto-log avec durée, direction, timestamp.
  Phone matching auto vers candidat/client.

✅ Gmail OAuth fonctionnel
→ Send, read, search, labels. Auto-création de contacts depuis emails entrants.
  Sync bidirectionnelle.

✅ Google Calendar intégré
→ Création RDV, fetch agenda, Calendly parsing.

✅ API REST complète
→ CRUD disponible sur toutes les entités via Fastify + routes structurées.
  Un agent IA peut opérer via l'API.

✅ Authentification API robuste
→ JWT + refresh tokens. Rate limiting présent.

⚠️ Phone matching charge tout en mémoire
→ matchPhoneNumber() dans Allo service charge TOUS les candidats et clients
  pour matcher un numéro. OK pour 1000 contacts, problème pour 50000+.
→ Recommandation : Index sur le champ telephone + query SQL directe. Priorité HAUTE.

⚠️ Pas de webhooks sortants
→ L'API reçoit des webhooks (Allo, Gmail Pub/Sub) mais n'en envoie pas.
  Impossible de connecter des outils tiers (Zapier, Make, n8n) aux événements de l'ATS.
→ Recommandation : Système de webhooks sortants configurable sur les événements clés. Priorité HAUTE.

⚠️ AuditLog existe mais est vide
→ Le modèle AuditLog est dans le schema Prisma mais aucun code ne l'utilise.
  Pour la compliance et le debug, c'est important.
→ Recommandation : Middleware Fastify qui logge toutes les mutations critiques. Priorité BASSE.

❌ Pas de Google Docs/Gemini integration
→ Les transcripts Gemini doivent être copiés manuellement.
  Pas d'import automatique depuis Google Docs.
→ Recommandation : Google Docs API → fetch documents partagés → rattacher aux fiches. Priorité MOYENNE.

❌ Reminder model inutilisé
→ Le modèle Reminder existe dans le schema mais aucun service ne l'utilise.
  Les rappels programmés ne fonctionnent pas.
→ Recommandation : Implémenter le service Reminder avec notifications push. Priorité HAUTE.

💡 GraphQL ou WebSocket pour temps réel
→ L'API est REST-only. Pour les mises à jour temps réel (nouveau email, appel entrant),
  des WebSockets seraient nécessaires.
```

---

## 11. MULTI-USER & PERMISSIONS

**Résumé : ✅ 3 | ⚠️ 2 | ❌ 1 | 💡 0**

```
✅ Mandats partagés visibles
→ Les recruteurs voient les mandats qui leur sont assignés + les mandats de l'équipe.

✅ Admin vue d'ensemble
→ L'admin a accès à toutes les entités, stats individuelles, settings.

✅ Assignation mandats claire
→ Chaque mandat a un recruteurId. Le recruteur assigné est visible sur la fiche.

⚠️ Pas de notes privées
→ Toutes les notes/activités sont visibles par toute l'équipe.
  Un recruteur ne peut pas noter "Ce candidat négocie en secret avec un concurrent"
  sans que l'équipe le voie.
→ Recommandation : Champ isPrivate sur les activités de type NOTE. Priorité MOYENNE.

⚠️ Stats individuelles visibilité
→ Les stats semblent accessibles par tous les recruteurs, pas seulement l'admin.
→ Recommandation : Restreindre les stats détaillées par recruteur à l'admin uniquement. Priorité BASSE.

❌ Pas de rôles granulaires
→ Deux rôles seulement : ADMIN et USER. Pas de rôle "Manager" qui voit les stats
  de son équipe sans être admin. Pas de permissions par entité.
→ Recommandation : Ajouter rôle MANAGER avec permissions intermédiaires. Priorité BASSE.
```

---

## 12. UX / VITESSE / ERGONOMIE

**Résumé : ✅ 6 | ⚠️ 4 | ❌ 2 | 💡 1**

```
✅ Recherche globale Ctrl+K
→ Accessible depuis partout, cherche candidats/clients/entreprises/mandats. Bien.

✅ Drag & drop kanban
→ Déplacement candidats dans le pipeline = drag & drop fluide. Objectif atteint.

✅ Navigation relationnelle
→ Candidat → ses mandats → le client → l'entreprise.
  Tout est lié par des liens cliquables.

✅ Design clean
→ Tailwind CSS v4, design system cohérent, animations Framer Motion légères.
  Pas d'animations qui ralentissent.

✅ Inline editing
→ Les fiches candidat/client/mandat supportent l'édition inline
  (cliquer sur un champ → modifier → sauvegarder).

✅ Formulaires avec valeurs par défaut
→ Les selects ont des valeurs par défaut intelligentes (statut OUVERT, priorité NORMALE, fee 20%).

⚠️ Créer un candidat = 4-5 clics (objectif ≤ 3)
→ Navigation → clic "Nouveau" → formulaire → remplir → sauvegarder.
  Pourrait être 3 clics avec un modal depuis n'importe où.
→ Recommandation : Raccourci global "C" → modal création rapide. Priorité MOYENNE.

⚠️ Envoyer un email template = 4+ clics
→ Ouvrir fiche → composer email → choisir template → remplir → envoyer.
  Objectif 3 clics non atteint.
→ Recommandation : Bouton "Envoyer template" directement depuis la liste candidats. Priorité MOYENNE.

⚠️ Pas de raccourcis clavier pour power users
→ Seul Ctrl+K existe. Pas de raccourcis pour : nouvelle note (N),
  nouveau candidat (C), nouvelle tâche (T), naviguer entre tabs.
→ Recommandation : Palette de raccourcis clavier (affichable via "?"). Priorité MOYENNE.

⚠️ Pas de mode mobile
→ L'app est responsive (Tailwind breakpoints) mais pas optimisée mobile.
  Le kanban est inutilisable sur petit écran.
→ Recommandation : Vue liste simplifiée sur mobile pour consultation. Priorité BASSE.

❌ Recherche lente et limitée (>500ms, 5 résultats)
→ La recherche utilise LIKE %term% sans index. Pour un recruteur avec 5000 candidats,
  c'est trop lent et les résultats tronqués à 5 sont frustrants.
→ Recommandation : PostgreSQL full-text search + augmenter à 20 résultats. Priorité CRITIQUE.

❌ Settings General save ne fonctionne pas
→ Le bouton "Sauvegarder" de la page Settings General n'a PAS de mutation wired.
  Les changements sont perdus au refresh. Bug critique.
→ Recommandation : Wirer la mutation PUT /settings sur le bouton save. Priorité CRITIQUE.

💡 Dark mode
→ Pas de dark mode. Les recruteurs qui travaillent tard apprécieraient.
```

---

## 13. DEAL BREAKERS — Vérification

```
1. ⚠️ ZÉRO DOUBLE SAISIE — Globalement OK mais le dédoublonnage manque
   → risque de re-saisir un candidat qui existe déjà.

2. ✅ LOGGING AUTOMATIQUE — Appels Allo ✓, Emails Gmail ✓, RDV Calendar ✓,
   Stage changes ✓. Le core est solide.

3. ❌ RECHERCHE INSTANTANÉE — FAIL. Substring match, 5 résultats, pas de full-text.
   Très en dessous du seuil < 500ms.

4. ✅ REVENUE VISIBLE PARTOUT — Fee par mandat ✓, forecast pondéré dashboard ✓,
   CA réalisé ✓. Revenue is king et c'est tracké.

5. ❌ RELANCES IMPOSSIBLES À OUBLIER — FAIL. Le bouton "Nouvelle tâche" ne fonctionne pas.
   Pas de tâches auto-créées au changement de stage. Pas de récurrence.
   Un recruteur VA oublier des relances.

6. ✅ NAVIGATION RELATIONNELLE — Candidat → Mandat → Client → Entreprise en clics. OK.

7. ✅ TEMPLATES EMAIL — Système de templates fonctionnel avec variables.
   ⚠️ Mais pas intégré dans Adchase.

8. ⚠️ AGENT-FRIENDLY API — REST API complète. MAIS pas de webhooks sortants,
   pas de WebSocket. Un agent IA peut opérer mais ne reçoit pas de notifications.

9. ❌ IMPORT LINKEDIN SANS FRICTION — FAIL TOTAL. Pas de Chrome Extension.

BILAN DEAL BREAKERS : 3 ✅ | 3 ⚠️ | 3 ❌
Les 3 ❌ (Recherche, Tâches, Chrome Extension) sont à corriger en priorité absolue.
```

---

## TOP 10 DES RECOMMANDATIONS PRIORITAIRES

### Quick Wins (fort impact, facile)

**1. 🔴 Fixer le bouton "Nouvelle tâche" + CRUD complet tâches**
- Impact : CRITIQUE — sans ça le recruteur ne peut pas créer de rappels
- Effort : S (1-2 jours)
- Fichiers : tache.service.ts, taches/index.tsx

**2. 🔴 Fixer Settings General save**
- Impact : CRITIQUE — les settings ne se sauvegardent pas
- Effort : S (quelques heures)
- Fichiers : settings/index.tsx

**3. 🔴 Implémenter les bulk actions candidats (au minimum stage change)**
- Impact : HAUT — trier 50 candidats un par un est une perte de temps massive
- Effort : S (2-3 jours)
- Fichiers : candidats/index.tsx, candidature.service.ts

### Projets Structurants (fort impact, effort moyen)

**4. 🟠 Recherche full-text PostgreSQL**
- Impact : CRITIQUE — la recherche est le premier outil du recruteur
- Effort : M (1 semaine)
- Fichiers : search.service.ts, schema.prisma (ts_vector)

**5. 🟠 Tâches auto-créées au changement de stage**
- Impact : CRITIQUE — le système doit créer les relances automatiquement
- Effort : M (3-5 jours)
- Fichiers : candidature.service.ts, nouveau modèle StageTaskTemplate

**6. 🟠 Chrome Extension LinkedIn v1**
- Impact : CRITIQUE — sans extension pas d'adoption par les sourceurs
- Effort : L (2-3 semaines)
- Fichiers : nouveau projet /extension

**7. 🟠 Email tracking (open/click)**
- Impact : HAUT — savoir si un client lit les emails de présentation = intelligence commerciale
- Effort : M (1 semaine)
- Fichiers : gmail.service.ts, email templates

**8. 🟠 Alertes candidats bloqués dans un stage**
- Impact : HAUT — les deals meurent quand les candidats stagnent
- Effort : M (3-5 jours)
- Fichiers : nouveau cron job, notifications

### Nice-to-Have (impact moyen, facile)

**9. 🟡 Export PDF/Excel pour les reports**
- Impact : MOYEN — nécessaire pour les board meetings mais pas quotidien
- Effort : S (2-3 jours)
- Fichiers : reports page, nouveau endpoint export

**10. 🟡 Raccourcis clavier power user (N, C, T, ?)**
- Impact : MOYEN — fait gagner des secondes par action × 100 actions/jour = significatif
- Effort : S (1-2 jours)
- Fichiers : layout.tsx, nouveau hook useKeyboardShortcuts

---

## AUTOMATISATIONS MANQUANTES — Classées par valeur

| # | Automatisation | Temps gagné/sem | Priorité |
|---|---------------|----------------|----------|
| 1 | Tâches auto-créées au changement de stage kanban | 2-3h | CRITIQUE |
| 2 | Alerte candidats stagnants dans un stage > X jours | 1-2h | CRITIQUE |
| 3 | Dédoublonnage automatique à la création candidat | 1h | HAUTE |
| 4 | Résumé IA auto-généré après chaque appel Allo | 1-2h | HAUTE |
| 5 | Tâche de suivi auto-créée après un appel | 1h | HAUTE |
| 6 | Alerte relance client inactif (>3 mois sans mandat) | 30min | HAUTE |
| 7 | Morning briefing IA (3 priorités du jour) | 30min | HAUTE |
| 8 | Auto-tagging compétences depuis parsing CV | 1h | MOYENNE |
| 9 | Rapport hebdomadaire auto-envoyé par email | 30min | MOYENNE |
| 10 | Tâches récurrentes (relance client mensuelle) | 1h | MOYENNE |
| 11 | Score client auto-calculé (A/B/C) | 15min | MOYENNE |
| 12 | Revenue cumulé auto-agrégé par entreprise | 15min | MOYENNE |
| 13 | Time-to-fill calculé automatiquement | 15min | MOYENNE |
| 14 | Alerte KPI sous seuil (< 20 appels/semaine) | 15min | BASSE |
| 15 | Next best action IA sur les mandats actifs | 30min | BASSE |

**Total estimé si tout est implémenté : 10-15h gagnées par recruteur par semaine.**

---

## TOP 15+ NOUVELLES FONCTIONNALITÉS

```
🆕 1. FAST RESUME REVIEW (Feature imposée)
Impact revenue : ⭐⭐⭐⭐⭐
Avantage compétitif : ⭐⭐⭐⭐⭐
Effort : M
→ Interface Tinder-like pour trier les CV/profils à toute vitesse. Raccourcis clavier :
  ← (Rejeter) → (Shortlist) ↑ (Peut-être/Later) ↓ (Voir détails).
  Le profil s'affiche en plein écran avec les infos clés : photo, nom, titre actuel,
  entreprise, années XP, compétences clés, score IA vs scorecard mandat.
  Le recruteur ne touche jamais la souris. 50 profils triés en 10 minutes au lieu de 45.
→ Implémentation : nouvelle route /mandats/:id/review. Fetch les candidatures
  en stage SOURCING. Swipe API (PATCH candidature stage). Keyboard event listeners.
  Score IA = compare profil candidat vs scorecard mandat.
→ Sprint recommandé : Sprint 2 (après les fixes critiques)

🆕 2. AI CANDIDATE MATCHING
Impact revenue : ⭐⭐⭐⭐⭐
Avantage compétitif : ⭐⭐⭐⭐⭐
Effort : M
→ Quand un nouveau mandat est créé, l'IA scanne toute la base candidats et propose
  un Top 10 de matchs avec score de compatibilité (basé sur scorecard, compétences,
  localisation, salaire, disponibilité). Le recruteur ajoute les meilleurs en 1 clic.
  Ça transforme le sourcing passif en sourcing intelligent.
→ Implémentation : POST /ai/mandat/:id/match-candidates. Embedding vectoriel des profils
  candidats + scorecard mandat. Cosine similarity. Top 10 avec score %.
→ Sprint recommandé : Sprint 3

🆕 3. PIPELINE INTELLIGENCE DASHBOARD
Impact revenue : ⭐⭐⭐⭐⭐
Avantage compétitif : ⭐⭐⭐⭐
Effort : M
→ Dashboard analytique qui prédit quels mandats vont closer et lesquels sont en danger.
  Basé sur : vélocité (jours par stage), nombre de candidats actifs vs benchmark,
  historique du client (taux de conversion), dernière activité.
  Indicateur RAG (Rouge/Ambre/Vert) par mandat avec recommandation d'action.
→ Implémentation : Scoring algorithm basé sur les données historiques.
  Nouveau widget dashboard ou page dédiée /pipeline-intelligence.
→ Sprint recommandé : Sprint 4

🆕 4. CLIENT PORTAL
Impact revenue : ⭐⭐⭐⭐
Avantage compétitif : ⭐⭐⭐⭐⭐
Effort : L
→ Interface web en lecture que le recruteur partage avec son client. Le client voit :
  les candidats en shortlist (profil anonymisé ou complet), les notes du recruteur,
  et peut donner son feedback directement (Oui/Non/À revoir) sans email.
  Ça accélère le process de 2-5 jours par candidat et professionnalise le service.
→ Implémentation : Sous-domaine /portal/:token. JWT temporaire par mandat.
  Vue read-only des candidatures en stage SHORTLIST+.
→ Sprint recommandé : Sprint 5

🆕 5. SMART SEQUENCES WITH CONDITIONS
Impact revenue : ⭐⭐⭐⭐
Avantage compétitif : ⭐⭐⭐⭐
Effort : M
→ Les séquences actuelles sont linéaires (step 1 → step 2 → step 3).
  Ajouter des conditions : SI email ouvert → envoyer follow-up A.
  SI pas ouvert après 3 jours → envoyer follow-up B. SI réponse → stopper et notifier.
  Ça transforme les séquences en mini-workflows intelligents.
→ Implémentation : Modèle SequenceCondition avec type (opened, clicked, replied, no_action).
  Branch logic dans le step executor.
→ Sprint recommandé : Sprint 4

🆕 6. REVENUE FORECASTING ENGINE
Impact revenue : ⭐⭐⭐⭐⭐
Avantage compétitif : ⭐⭐⭐⭐
Effort : M
→ Au-delà du simple calcul pondéré, un vrai engine de forecast qui prend en compte :
  l'historique de conversion par client, la vélocité actuelle du pipe, la saisonnalité,
  le nombre de mandats à venir (basé sur le pipeline commercial client).
  Affiche : forecast 30/60/90 jours, best case / expected / worst case.
→ Implémentation : Algorithme de forecast basé sur les données historiques.
  Monte Carlo simulation simplifié. Affichage graphique avec intervalles de confiance.
→ Sprint recommandé : Sprint 5

🆕 7. INTERVIEW SCHEDULER
Impact revenue : ⭐⭐⭐⭐
Avantage compétitif : ⭐⭐⭐
Effort : M
→ Outil de planification d'entretiens qui propose automatiquement des créneaux
  en croisant les agendas du candidat, du recruteur et du client.
  Le candidat reçoit un lien Calendly-like pour choisir un créneau.
  Fini les 10 emails pour caler un RDV.
→ Implémentation : Endpoint /interviews/schedule avec disponibilités.
  Page publique /book/:token. Google Calendar FreeBusy API.
→ Sprint recommandé : Sprint 3

🆕 8. CANDIDATE ENGAGEMENT SCORING
Impact revenue : ⭐⭐⭐⭐
Avantage compétitif : ⭐⭐⭐⭐
Effort : S
→ Score d'engagement candidat basé sur : vitesse de réponse aux emails,
  nombre de calls décrochés, participation aux entretiens, réactivité.
  Un candidat "chaud" (score > 80) doit être priorisé.
  Un candidat "froid" (score < 30) = probablement en process ailleurs.
→ Implémentation : Calcul basé sur les Activités existantes.
  Nouveau champ calculé affiché sur la fiche et le kanban.
→ Sprint recommandé : Sprint 2

🆕 9. DUPLICATE DETECTION & MERGE
Impact revenue : ⭐⭐⭐
Avantage compétitif : ⭐⭐⭐
Effort : M
→ Détection automatique des doublons (même email, même LinkedIn URL,
  même nom+prénom+entreprise). Interface de merge qui permet de fusionner
  deux fiches en gardant les meilleures données de chaque.
→ Implémentation : Cron de détection + page /admin/duplicates.
  Service de merge qui consolide activités, candidatures, tags.
→ Sprint recommandé : Sprint 3

🆕 10. PLACEMENT LIFECYCLE (Post-Placement)
Impact revenue : ⭐⭐⭐⭐
Avantage compétitif : ⭐⭐⭐⭐
Effort : M
→ Après le placement, le cycle continue : période d'essai (garantie),
  check-in à 1/3/6 mois, facturation, paiement, relance impayé.
  Suivi automatique avec tâches récurrentes et alertes si garantie expire.
  Ça sécurise le revenue ET génère du repeat business (le candidat placé
  devient un futur client ou référent).
→ Implémentation : Nouveau statut post-PLACE (INTEGRATION, PERIODE_ESSAI, CONFIRME).
  Tâches auto-créées pour les check-ins. Alerte fin de garantie.
→ Sprint recommandé : Sprint 4

🆕 11. AI CALL PREP BRIEF
Impact revenue : ⭐⭐⭐⭐
Avantage compétitif : ⭐⭐⭐⭐
Effort : S
→ Avant chaque call avec un candidat ou client, l'IA génère un brief de 30 secondes :
  dernière interaction, stage actuel, points clés à aborder, objections probables,
  info marché pertinente. Le recruteur est préparé en 30 secondes au lieu de 5 minutes.
→ Implémentation : Endpoint existant /ai/call-brief à enrichir avec plus de contexte.
  Widget CallBriefPanel existe déjà → l'améliorer et le rendre automatique avant chaque call.
→ Sprint recommandé : Sprint 2

🆕 12. KANBAN MULTI-VUE (Client → Mandats → Candidats)
Impact revenue : ⭐⭐⭐
Avantage compétitif : ⭐⭐⭐
Effort : M
→ Un méga-kanban qui permet de voir : tous les mandats d'un client en colonnes,
  avec les candidats dans chaque mandat. Vue d'ensemble pour les gros comptes
  multi-mandats. Permet de réallouer un candidat refusé d'un mandat vers un autre
  du même client en drag & drop.
→ Implémentation : Page /clients/:id/kanban-overview.
  Fetch tous les mandats du client + candidatures. Layout en colonnes imbriquées.
→ Sprint recommandé : Sprint 5

🆕 13. SLACK / TELEGRAM NOTIFICATIONS
Impact revenue : ⭐⭐⭐
Avantage compétitif : ⭐⭐⭐
Effort : S
→ Notifications push en temps réel quand : email reçu d'un client, candidat
  change de stage, tâche en retard, nouveau candidat ajouté par un collègue.
  Le recruteur est en déplacement et reçoit sur Slack/Telegram.
→ Implémentation : Slack webhook déjà partiellement intégré.
  Ajouter Telegram bot. Hook sur les événements clés.
→ Sprint recommandé : Sprint 2

🆕 14. DOCUMENT MANAGEMENT (CV, Contrats, Briefs)
Impact revenue : ⭐⭐⭐
Avantage compétitif : ⭐⭐⭐
Effort : M
→ Gestion centralisée des documents : CV (versionnés), contrats, briefs mandat,
  NDA, grilles salariales. Attachables à candidat/mandat/client.
  Upload + preview inline + envoi en pièce jointe email.
→ Implémentation : Modèle Document avec S3/MinIO storage.
  Upload component. Preview PDF/image inline. Attach to email.
→ Sprint recommandé : Sprint 3

🆕 15. MARKET INTELLIGENCE (Salaires, Trends)
Impact revenue : ⭐⭐⭐⭐
Avantage compétitif : ⭐⭐⭐⭐⭐
Effort : L
→ Basé sur les données internes (placements réalisés, salaires négociés,
  refus par salaire) + données marché : benchmark salarial par poste/localisation/séniorité.
  Le recruteur peut dire au client "Le marché paye X pour ce poste" avec data.
  Ça positionne le cabinet comme expert et justifie les fees.
→ Implémentation : Agrégation anonymisée des données de placements.
  Intégration API salaire (Glassdoor, Levels.fyi) si disponible.
  Page /insights avec graphiques.
→ Sprint recommandé : Sprint 6

🆕 16. WHITE-LABEL CLIENT REPORTS
Impact revenue : ⭐⭐⭐⭐
Avantage compétitif : ⭐⭐⭐⭐
Effort : M
→ Rapports PDF automatisés et brandés HumanUp à envoyer aux clients :
  état d'avancement du mandat, candidats présentés, shortlist, timeline.
  Le client reçoit un rapport professionnel sans que le recruteur rédige quoi que ce soit.
  Ça remplace les emails de suivi manuels et professionnalise le service.
→ Implémentation : Template PDF (html-to-pdf avec puppeteer).
  Données auto-générées depuis le mandat + candidatures. Bouton "Envoyer rapport au client".
→ Sprint recommandé : Sprint 4

🆕 17. TEAM LEADERBOARD & GAMIFICATION
Impact revenue : ⭐⭐⭐
Avantage compétitif : ⭐⭐⭐
Effort : S
→ Classement temps réel des recruteurs par : placements, revenue, appels, emails envoyés.
  Badges, streaks ("10 appels d'affilée"), objectifs hebdomadaires.
  La compétition saine motive les équipes de recrutement.
→ Implémentation : Page /leaderboard. Calculs basés sur les Activités existantes.
  Badges en base (nouveau modèle Achievement).
→ Sprint recommandé : Sprint 5
```

---

## SYNTHÈSE GLOBALE

### Scores par section

| Section | ✅ | ⚠️ | ❌ | 💡 | Note |
|---------|---|---|---|---|------|
| 1. Dashboard | 5 | 3 | 2 | 3 | 7/10 |
| 2. Candidats | 7 | 4 | 3 | 2 | 7/10 |
| 3. Mandats | 7 | 3 | 2 | 2 | 7.5/10 |
| 4. Clients & Entreprises | 5 | 3 | 3 | 1 | 6/10 |
| 5. Activités & Journal | 5 | 2 | 2 | 1 | 7/10 |
| 6. Tâches & Relances | 2 | 2 | 5 | 1 | 3/10 |
| 7. Communications | 6 | 3 | 2 | 1 | 7/10 |
| 8. Reporting | 5 | 3 | 2 | 1 | 6.5/10 |
| 9. Chrome Extension | 0 | 0 | 5 | 0 | 0/10 |
| 10. Intégrations | 5 | 3 | 2 | 1 | 6.5/10 |
| 11. Multi-User | 3 | 2 | 1 | 0 | 6/10 |
| 12. UX/Ergonomie | 6 | 4 | 2 | 1 | 7/10 |
| **TOTAL** | **56** | **32** | **31** | **14** | **6.2/10** |

### Verdict

L'ATS HumanUp a des fondations solides : le logging automatique (Allo, Gmail, Calendar), le kanban, l'intégration IA (20+ endpoints), et la vision revenue sont de bonne qualité. Le dashboard est l'un des meilleurs que j'ai vus sur un outil de cette maturité.

**Mais 3 lacunes critiques empêchent l'adoption quotidienne :**

1. **Les tâches sont cassées** — On ne peut ni en créer, ni en éditer, et elles ne se créent pas automatiquement. Un recruteur qui oublie une relance perd un deal.

2. **La recherche est sous-dimensionnée** — 5 résultats en substring match, c'est inutilisable avec une base de 1000+ candidats. La recherche est l'action #1 du recruteur.

3. **Pas de Chrome Extension** — Sans bridge LinkedIn → ATS, les sourceurs ne peuvent pas adopter l'outil. C'est le point d'entrée #1 des candidats dans un cabinet de chasse.

**Correction de ces 3 points + implémentation du Fast Resume Review = un outil compétitif en 4-6 semaines.**

L'ambition à 6 mois : Client Portal + AI Matching + Pipeline Intelligence transformeraient HumanUp d'un "bon ATS" en une véritable arme compétitive face à Bullhorn/Vincere.

---

*Review complétée — 10 mars 2026*
*Perspective : Headhunter senior, 15+ ans d'expérience, fee-based recruitment*
