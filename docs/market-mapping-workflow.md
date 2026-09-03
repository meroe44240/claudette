# Workflow — Market Mapping quotidien Humanup.io

Tâche planifiée Claude Code (lundi–vendredi, le matin). Produit chaque jour 3 fichiers CSV de prospection (un par vertical), un XLSX consolidé et un rapport de synthèse, puis commit + push + envoi Gmail/Slack.

- **Recruteurs** : Marie Le Ret (Finance, marie@humanup.io), Valentin Murcia (Hospitality, valentin@humanup.io), Alexis (Industrie, alexis@humanup.io)
- **Destinataire du rapport** : Méroë Nguimbi (meroe@humanup.io)
- **Dossier de sortie** : `outputs/`
- **Historique** : runs du 01/09, 02/09 et 03/09/2026 déjà commités sur `main`

---

## 1. Vue d'ensemble

```
Étape 0  date +%Y-%m-%d
Étape 1  Anti-doublons : scan outputs/*.csv (14 j) → liste d'entreprises EXCLUES
         + détection de récurrences (nouvelle annonce / news 7 j) → section Recurrences
Étape 2  5 sous-agents en parallèle (Task)
           ├─ Finance A  (Compta + CdG)                      → outputs/_fin_a_{date}.csv  (14 lignes)
           ├─ Finance B  (Audit + Cabinet + Conso + Fiscalité)→ outputs/_fin_b_{date}.csv  (14 lignes)
           ├─ Finance C  (Paie + Tréso + DAF)                 → outputs/_fin_c_{date}.csv  (12 lignes)
           ├─ Hospitality                                     → outputs/hospitality_{date}.csv (40 lignes)
           └─ Industrie                                       → outputs/industrie_{date}.csv   (40 lignes)
         Merge A+B+C → outputs/finance_{date}.csv (40 lignes)
Étape 3  XLSX consolidé 4 onglets → outputs/humanup_market_mapping_{date}.xlsx
Étape 4  Rapport → outputs/rapport_synthese_{date}.md
Étape 5  git add outputs/ && git commit -m "market mapping {date}" && git push
Étape 6  Gmail : 1 CSV par recruteur + rapport à Méroë
         Slack : #market-mapping ou DM Méroë
         PushNotification : résumé du run
```

---

## 2. Spécification complète (prompt de la tâche planifiée)

### Étape 1 — Anti-doublons + détection de récurrences

Scanner `outputs/*.csv` des 14 derniers jours et extraire la colonne `entreprise`.

- Cette liste est **exclue** de la nouvelle recherche d'opportunités.
- Pour chaque entreprise déjà ciblée, vérifier via WebSearch si elle a une **nouvelle annonce** ou une **news fraîche** (7 derniers jours). Si oui → l'ajouter à la section `## Recurrences` du rapport.

### Étape 2 — Sous-agents parallèles

Un sous-agent par vertical. Finance est splité en 3 sub-sub-agents (A / B / C) qui écrivent dans `_fin_a/_b/_c_{date}.csv`, puis merge en `finance_{date}.csv`.

#### Volume cible (par vertical)

- 14 job ads (7 derniers jours) + 6 signaux news (30 derniers jours) = 20 opportunités
- 2 contacts cibles par opportunité = **40 lignes par CSV** + header
- Finance : A = 5 jobs + 2 news (14 lignes), B = 5 jobs + 2 news (14 lignes), C = 4 jobs + 2 news (12 lignes)

#### Filtres d'exclusion stricts

1. **Plafond effectif < 2000 salariés au niveau du GROUPE** (pas du site). Vérifier via Pappers / Societe.com / site corporate. Hôtels Accor, Marriott, Hilton, IHG, Hyatt, Rosewood, Four Seasons, Mandarin Oriental → tous exclus.
2. **Exclusion < 5 salariés** : si non vérifiable en 30 s → exclure par prudence.
3. **Exclusion alternance / stage** : aucune annonce avec Alternance, Apprentissage, Contrat pro, Stage, Stagiaire, Apprenti, Alternant dans le titre ou la description.
4. **Liste noire** :
   - Big 4 : Deloitte, EY, KPMG, PwC
   - Next tier : Mazars, Grant Thornton, BDO, RSM, Baker Tilly
   - Réseaux EC : In Extenso, Fiducial, Cerfrance, Exco, Sofarec
   - SaaS / Scale-ups : Cegid, Sage, Pennylane, Qonto, Alan, Mirakl, Payfit, Spendesk, BlaBlaCar, Doctolib, Swile, Lydia, Sorare, Contentsquare, Ankorstore, ManoMano, Back Market, Dataiku, Aircall, Shine, Ledger, OVHcloud, Ornikar, Younited, Alma, Libeo, Pigment, Mistral AI, Brigad
   - CAC 40 : TotalEnergies, EDF, Engie, Air Liquide, Saint-Gobain, Schneider, Legrand, Vinci, Bouygues, Eiffage, Alstom, Safran, Thales, Dassault Aviation, Airbus, Renault, Stellantis, Michelin, Arkema, Solvay, L'Oréal, LVMH, Kering, Hermès, Danone, Pernod Ricard, Carrefour, Auchan, Leclerc, Decathlon
   - Cabinets intérim masquant l'employeur : Fed Finance, Michael Page, Hays, Robert Half, Walters People, Eclipse, Adecco, Manpower, Randstad, Synergie, Lynkus, Momenti, Harry Hope, Sup Interim, Temporis → exclure si client final masqué

#### Profil cible (dark horses)

- Idéal : 50–2000 sal, CA 10–500 M€
- Acceptable : 5–50 sal si structure pro réelle
- Indépendance : familiales, groupes indépendants, filiales FR de groupes étrangers discrets
- Géo Industrie : privilégier les régions (Bretagne, Nord, Grand Est, Occitanie, ARA, Nouvelle-Aquitaine, Pays de la Loire, BFC) plutôt que Paris / IdF

#### Règle de contacts selon taille

| Taille | Contact 1 | Contact 2 |
|---|---|---|
| 5–50 sal | Fondateur / CEO / DG (recrute lui-même) | DRH ou RAF |
| 50–500 sal | DAF / Directeur site / N+1 fonctionnel | DRH |
| 500–2000 sal | N+1 fonctionnel direct (Chef compta, Resp prod, Chef réception…) | DRH ou Talent Acquisition |

NEWS : Contact 1 = décideur stratégique selon la nature du signal (CEO / DG / CFO / investisseur lead) + Contact 2 = DRH / TA.

#### Sourcing nominatif (max 3 essais par contact, best-effort)

1. WebSearch `site:linkedin.com/in "{poste}" "{entreprise}"`
2. Pappers.fr (mandataires sociaux), site entreprise
3. Presse spécialisée (Les Échos PME, DAF-Mag, Journal des Palaces, Usine Nouvelle, presse régionale)

Si pas trouvé après 3 essais → `nom`, `prenom`, `linkedin` vides + tag `CONTACT_NON_SOURCE`. **Jamais inventer un nom.**

#### Postes à scraper

**Marie — Finance**
- Part A : Comptable général / unique, Chef compta, Resp compta, Comptable fournisseurs / clients / intercos / analytique, CdG (jr / conf / sr / industriel / commercial / sociale / achats), Contrôleur financier, Business controller
- Part B : Collaborateur compta cabinet (jr / conf / sr), Chef de mission, Réviseur, EC stagiaire, Auditeur (jr / conf / sr / interne / externe), Manager audit, Consolideur, Chargé conso, Fiscaliste
- Part C : Gestionnaire paie (jr / conf / sr), Resp paie, Trésorier, Credit manager, Analyste crédit, Resp recouvrement, RAF, Assistant DAF, DAF adjoint PME

**Valentin — Hospitality**
Réceptionniste (poly / tournant / chef), Night auditor / manager, Front office manager, Concierge, Gouvernant(e), Resp housekeeping, Maître d'hôtel, Directeur de salle / restaurant, Chef de rang, Bar manager, Sommelier, Chef de partie, Sous-chef, Chef pâtissier, F&B manager, Resp banquet / petit-déj, Events manager, MICE coordinator, Revenue manager, E-distribution manager, Reservation manager, Économe, Acheteur F&B, Directeur d'hôtel PME / indépendant, Hotel ops manager, Spa manager.

**Alexis — Industrie**
- Production : Tech production, Conducteur ligne / machine, Opérateur (CN), Régleur, Chef équipe production, Superviseur, Chef d'atelier, Resp atelier / production
- Maintenance : Tech maintenance, Électromécanicien, Électrotechnicien, Mécanicien indus, Automaticien, Chef équipe maintenance, Resp maintenance, Planificateur / Ordonnanceur
- Qualité : Tech qualité, Qualiticien, Animateur qualité, Resp qualité, Ingé qualité, QHSE
- BE / Méthodes : Dessinateur-projeteur, Projeteur méca / élec, Tech / Ingé méthodes, Ingé industrialisation, Resp BE
- Logistique indus : Chef magasinier, Resp logistique indus, Approvisionneur, Planificateur indus, Ordonnanceur, Resp SC site, Resp ADV indus
- Chantier : Conducteur travaux, Chef chantier, Chargé d'affaires (travaux / indus / CVC / élec)
- Commercial indus : Technico-commercial, Ingénieur d'affaires, Commercial BtoB indus
- Achats : Acheteur industriel / technique
- Direction PME (< 500 sal) : Directeur usine PME, Directeur site / indus / technique
- **À exclure** : Business Developer, Head of, VP, Chief

#### Format CSV (11 colonnes, import Propium direct)

Header exact :

```
nom;prenom;email;telephone;poste;entreprise;localisation;linkedin;source;tags;notes
```

| Colonne | Règle |
|---|---|
| `nom`, `prenom`, `linkedin` | remplis si sourcé, vides sinon |
| `email`, `telephone` | toujours vides (FullEnrich enrichit) |
| `poste` | titre du contact cible (rôle, pas le job ad) |
| `entreprise` | raison sociale exacte |
| `localisation` | `Ville (XX)`, ex. `Nantes (44)` |
| `source` | plateforme (APEC, LinkedIn, Journal des Palaces, Usine Nouvelle…) |
| `tags` | `{VERTICAL},{JOB\|NEWS},{CONTACT_TYPE},{EFFECTIF_RANGE},{CONTACT_1\|CONTACT_2}[,CONTACT_NON_SOURCE]` |
| `notes` | `Poste: {x} \| Date: {YYYY-MM-DD} \| Effectif: {x} \| CA: {x ou NC} \| Salaire: {x ou NC} \| Source: {x} \| Lien: {URL} \| Contexte: {1-2 phrases}` |

- VERTICAL : FINANCE, HOSPITALITY, INDUSTRIE
- CONTACT_TYPE : FONDATEUR, CEO, DG, DAF, CFO, RAF, DRH, TALENT_ACQUISITION, HIRING_MANAGER, GM, DIRECTEUR_HOTEL, FB_MANAGER, DIRECTEUR_SITE, RESP_PRODUCTION, etc.

Format technique : UTF-8 BOM (`encoding='utf-8-sig'`), séparateur `;`, fin de ligne CRLF, pas de `;` dans les champs (utiliser `|`), génération via Python `csv` + `openpyxl`.

### Étape 3 — XLSX consolidé

`outputs/humanup_market_mapping_{date}.xlsx`, 4 onglets :

1. Synthese (stats + signaux prioritaires + section Recurrences)
2. Marie - Finance
3. Valentin - Hospitality
4. Alexis - Industrie

Formatage : header bleu (`1F4E79`) / blanc / gras, freeze panes A2, auto-filter, colonne `tags` surlignée vert (`C6EFCE`) si contact sourcé, rouge (`FFC7CE`) si `CONTACT_NON_SOURCE`, largeur auto (max 60).

### Étape 4 — Rapport synthèse

`outputs/rapport_synthese_{date}.md` :

- Volumes par vertical (sourcés / total)
- Top régions / villes / secteurs
- Top 7 signaux business prioritaires
- Section Recurrences
- Liste noire + plafond 2000 sal appliqués

### Étape 5 — Commit + push

```bash
git add outputs/
git commit -m "market mapping $(date +%Y-%m-%d)"
git push origin main
```

### Étape 6 — Envoi email + Slack

- Gmail disponible → chaque CSV en pièce jointe au recruteur correspondant + rapport à meroe@humanup.io
- Slack disponible → message dans `#market-mapping` (ou DM à Méroë) avec résumé et liens vers les fichiers commités
- Aucun connecteur → le signaler dans la sortie texte et lister les fichiers à récupérer via `git pull`

### Contraintes

- Aucune donnée inventée. URLs réelles vérifiables.
- Best-effort : si un volume cible n'est pas atteint, livrer ce qui est trouvé et le signaler dans le rapport.
- Privilégier l'intégrité au volume.

---

## 3. Exécution réelle du 03/09/2026

| Étape | Résultat |
|---|---|
| Anti-doublons | 107 entreprises exclues (CSV du 01/09 + 02/09). 3 récurrences détectées : Groupe AIM / Romaire, Champagne Hospitality / La Commaraine, Eurogerm |
| Agents | 5 agents lancés en parallèle (Finance A, B, C, Hospitality, Industrie) |
| Finance A | 4 lignes / 14 cibles (Conserverie Chancerelle uniquement). Budget WebSearch épuisé. 0 sourcé |
| Finance B | 14 lignes / 14. 5 contacts sourcés (Archipel, EUREX, Endrix) |
| Finance C | 12 lignes / 12. 0 sourcé |
| Finance mergé | 30 lignes / 40 |
| Hospitality | 40 lignes / 40, 19 hôtels. 3 sourcés. Seul The Brando strictement < 7 j |
| Industrie | 40 lignes / 40, 20 entreprises. 3 sourcés. Zwilling Staub et K-Line à valider (effectif groupe) |
| XLSX | 4 onglets, 25 Ko |
| Commit | `7080881 market mapping 2026-09-03`, poussé via `git push -u origin HEAD:main` (HEAD détaché) |
| Gmail | 4 emails envoyés : Marie (finance CSV), Valentin (hospitality CSV), Alexis (industrie CSV), Méroë (rapport dans le corps) |
| Slack | `#market-mapping` introuvable → DM à Méroë (U0239VCFNNA) |
| Push notification | Envoyée avec résumé du run |

Total : 110 lignes, ~53 entreprises, 11 contacts sourcés (10 %).

---

## 4. Limites rencontrées et corrections recommandées

1. **Budget WebSearch (200 requêtes / agent)** épuisé avant le sourcing nominatif. Finance A n'a livré que 4 lignes. → Remonter `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` ou passer Finance A en deux agents (Compta / CdG).
2. **Proxy réseau** : APEC, Indeed, LinkedIn, Hellowork, Pappers, Societe.com, Welcome to the Jungle, Cadremploi, France Travail inaccessibles via WebFetch. Les agents travaillent sur les snippets WebSearch uniquement, d'où beaucoup de `NC` et d'effectifs non confirmés. → Autoriser ces domaines dans la politique réseau de l'environnement.
3. **Pièces jointes Gmail** : un CSV de 20 Ko devient ~30 Ko en base64, ce qui dépasse ce qu'un appel d'outil peut porter en une fois. Le XLSX n'a pas pu être attaché, et le CSV Hospitality est parti tronqué (seules les premières lignes). Les fichiers complets sont sur `main`. → Envoyer un lien GitHub vers `outputs/` plutôt que des pièces jointes, ou passer par Drive.
4. **Slack** : le channel `#market-mapping` n'existe pas dans le workspace. → Le créer, ou garder le DM.
5. **Git** : la session démarre en HEAD détaché. Le push doit se faire avec `git push -u origin HEAD:main`, pas `git push origin main`.
6. **Hook Stop** : le hook "untracked files" se déclenche pendant que les agents tournent. Inoffensif, mais il faut attendre la fin des 5 agents avant de committer.

---

## 5. Fichiers produits par run

```
outputs/
├── _fin_a_{date}.csv                      # intermédiaire Finance A
├── _fin_b_{date}.csv                      # intermédiaire Finance B
├── _fin_c_{date}.csv                      # intermédiaire Finance C
├── finance_{date}.csv                     # Marie
├── hospitality_{date}.csv                 # Valentin
├── industrie_{date}.csv                   # Alexis
├── humanup_market_mapping_{date}.xlsx     # consolidé 4 onglets
└── rapport_synthese_{date}.md             # Méroë
```
