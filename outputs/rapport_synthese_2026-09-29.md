# Rapport de synthèse — Market Mapping Humanup.io
**Date : 2026-09-29** (mardi)

---

## 1. Volumes par verticale

| Verticale | Destinataire | Lignes | Entreprises | Opportunités | Contacts sourcés | Taux |
|---|---|---|---|---|---|---|
| Finance / Comptabilité | Valentin Murcia | 40 | 20 | 14 JOB + 6 NEWS | 6 | 15 % |
| Hospitality / Restauration | Valentin Murcia | 40 | 20 | 14 JOB + 6 NEWS | 5 | 13 % |
| Industrie | Alexis | 40 | 20 | 13 JOB + 7 NEWS | 1 | 3 % |
| Sales SaaS + portefeuille fonds | Louis | 40 | 20 | 13 JOB + 7 NEWS | 4 | 10 % |
| Sales tous secteurs | Méroë Nguimbi | 40 | 20 | 14 JOB + 6 NEWS | 4 | 10 % |
| **TOTAL** | | **200** | **100** | **68 JOB + 32 NEWS** | **20** | **10 %** |

Volume cible atteint sur les 5 verticales (40 lignes chacune).

---

## 2. ⚠️ Alerte qualité du run — sourcing nominatif très dégradé

**20 contacts nominatifs sur 200 lignes (10 %)**, contre un objectif habituel bien supérieur.
180 lignes portent le tag `CONTACT_NON_SOURCE` (nom, prénom et LinkedIn vides).

Deux causes techniques, aucune liée à la qualité des cibles :

1. **Quota de recherche web saturé en début de run.** Le budget WebSearch est partagé entre tous
   les sous-agents (200 appels pour la session). Il a été consommé pendant la phase de détection
   de récurrences et les 7 agents de sourcing lancés en parallèle, chacun n'ayant pu faire
   qu'environ 14 recherches au lieu des 60-80 nécessaires. La phase de sourcing nominatif
   (LinkedIn / Pappers, 3 essais par contact) n'a donc pas pu être menée sur la majorité des lignes.
   Les fichiers Industrie, Sales SaaS et Sales ont été complétés par un second passage (top-up)
   une fois le quota reconstitué, ce qui a permis d'atteindre les 40 lignes partout.
2. **Egress proxy bloquant (403 EGRESS_BLOCKED)** sur l'ensemble des sources utiles :
   APEC, Indeed, Hellowork, France Travail, LinkedIn, Welcome to the Jungle, Pappers,
   Societe.com, Taleez, Usine Nouvelle, Journal des Palaces, L'Hôtellerie Restauration,
   Le Journal des Entreprises, LSA, Option Finance, DAF-Mag, et les sites corporate testés.
   Tout le travail a donc reposé sur les snippets WebSearch.

**Conséquences à connaître avant toute prospection :**
- **Dates d'annonces majoritairement `NC`** : la fenêtre stricte « publiée depuis moins de 7 jours »
  n'est pas prouvée ligne par ligne. Les annonces sont confirmées *actives en septembre 2026*.
  Seules quelques dates sont confirmées (POLYTECH 24/09, Sociabble 24/09, Ouest Conseils 19/09).
- **Effectifs, CA et salaires majoritairement `NC`** — à confirmer avant appel.
- Aucune donnée n'a été inventée : tout ce qui n'était pas confirmé est marqué `NC`, et aucun nom
  de contact n'a été supposé. L'intégrité a été privilégiée sur le volume, conformément à la consigne.

**Action recommandée :** relever le plafond de recherches web de la session
(`CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`) et/ou séquencer les agents plutôt que de les lancer
tous les 7 en parallèle, pour restaurer le sourcing nominatif sur les prochains runs.

---

## 3. Top régions / villes / secteurs

**Villes :** Paris (75) 40 lignes · Lyon (69) 12 · Nantes (44) 4 · Lille (59) 4 · Bordeaux (33) 4 ·
Levallois-Perret (92) 2 · La Haie-Fouassière (44) 2 · Quimper (29) 2 · Reims (51) 2 · Toulon (83) 2 ·
Strasbourg (67) 2. 10 lignes en localisation `NC`.

**Départements les plus représentés :** 75 (40) · 69 (18) · 59 (10) · 29 (8) · 83 (8) · 33 (8) ·
44 (6) · 64 (6) · 62 (4) · 35 (4) · 03 (4) · 38 (4) · 34 (4) · 71 (4) · 57 (4).

**Équilibre géographique :** la consigne « privilégier les régions » est respectée sur Industrie
(La Fouillouse 42, Faulquemont 57, La Roche-sur-Yon 85, Eyrein 19, Bailleul 59, Criquetot 76,
Ligier 03, Cedrat 38) et sur Finance (Quimper, Reims, Toulon, Strasbourg, Nantes, Hesdin 62, Nice).
Hospitality et Sales SaaS restent structurellement parisiens.

**Secteurs couverts :** expertise comptable indépendante et audit régional · direction financière
de PME/ETI · hôtellerie indépendante et restauration étoilée · plasturgie, mécanique, composites,
granulats, agroalimentaire, ENR, génie climatique · éditeurs SaaS B2B (BTP, RH, retail media,
legaltech, healthtech, fintech) · négoce technique, transport, télécom B2B, services au bâtiment.

---

## 4. Top 7 signaux business prioritaires

1. **Maison Neyret (La Fouillouse, 42)** — 20 M€ investis, site Digitrace opérationnel en
   septembre 2026, **~100 postes au démarrage + 100 à venir**. Le plus gros volume de recrutement
   industriel du jour.
2. **Kheops (Paris 12e)** — levée de **12 M€ le 21/09/2026** (Odyssée Venture + Isai + Elaia) avec
   **~30 recrutements annoncés dont des commerciaux**. Contact DG nominatif disponible
   (Caroline Poinsignon). Signal Sales SaaS le plus actionnable.
3. **Biolevate (Paris)** — **Série A de 30 M€ le 22/09/2026** (RAISE France, Orange Ventures,
   MSD GHI Fund, Station F, EQT Ventures). Montant le plus élevé de la fenêtre, phase de
   structuration commerciale à venir.
4. **WeMa (Strasbourg, 430 sal, ~50 M€)** — LBO minoritaire : Kresk Développement entre à 20 %
   (15-20 M€) + 105 M€ de dette Apera, stratégie de croissance externe à horizon 2030.
   Double besoin finance + intégration.
5. **DV GROUP (Hesdin, 62 — 350 sal, 50 M€)** — recrute **simultanément un RAF et un RAF adjoint**,
   sur fond de projets CSRD et de refonte ERP. Direction financière en pleine structuration :
   cible idéale success-fee.
6. **Jacir / groupe Cofinair (Criquetot-sur-Longueville, 76)** — 25 M€, regroupement de 3 sites,
   160 salariés, CA 40 M€. Réorganisation industrielle génératrice de besoins production,
   maintenance et méthodes.
7. **Groupe Anne-Sophie Pic** — ouverture d'**Anne-Sophie Pic Paris** à la Fondation Cartier le
   **18/09/2026** (date confirmée). Ouverture de table étoilée = besoins cuisine et salle immédiats.

**Autres signaux notables :** Wealthcome (15 M€, Breega + BlackFin, 24/09) · Kaiko (extension
Série B à 110 M USD, 14/09) · Zeliq (extension seed 7 M€, 22/09) · DimoMaint (build-up triple,
fonds Keensight) · Groupe Fahrenheit (levée Bpifrance Tourisme 3 pour 2 hôtels 4\*) ·
Van Den Casteele (20 M€, +20 recrutements, 07/09) · Balsamo (siège Paris ouvert le 21/09) ·
Charlott' (directrice commerciale promue DG le 03/09, pilotage force de vente VDI à repourvoir) ·
Groupe Charlois (DAF parti chez Agrial le 16/09, poste à repourvoir) ·
Amarris Expertise Comptable (39 M€ levés, 8 cabinets intégrés).

---

## 5. Recurrences — entreprises déjà ciblées avec un signal frais (22 → 29/09/2026)

43 des 215 entreprises de la liste anti-doublons ont été re-vérifiées. **5 récurrences confirmées**
(élément concret ET daté dans la fenêtre 7 jours) :

- **Voyageurs du Monde** — OPA en cours + nouvelles offres. Projet de note en réponse à l'offre
  publique d'Avantage déposé à l'AMF le 22/09 (180 €/action, sortie de cote visée), en parallèle de
  postes CDI publiés les 22, 23 et 28/09 (Paris, Lyon, Lausanne).
- **Equativ** — acquisition de Kamino Retail annoncée le 26/09 pour étendre sa division retail media,
  trois jours après son référencement comme partenaire technologique de ChatGPT Ads (23/09).
- **Stoïk** — ouverture le 23/09 de son premier programme partenaires MSP / infogéreurs /
  intégrateurs : structuration d'un canal indirect, donc de besoins commerciaux.
- **Groupe AGPM** — création annoncée le 25/09, avec KLESIA Mut', du fonds de dotation Joseph Kessel.
  Signal institutionnel plutôt que de recrutement.
- **PAREF Gestion** — renfort de l'équipe de développement annoncé à Patrimonia fin septembre :
  arrivée d'Aodren Guillou comme directeur des réseaux de distribution, accompagné de deux
  nouveaux collaborateurs.

**Signaux proches mais hors fenêtre (utiles en relance) :** Ingeliance (plan de ~200 postes, offre
du 21/09, un jour trop tôt) · Shippingbo (acquisition de Baback le 17/09) · Hackuity (Série B
19 M$ le 16/09) · Groupe Okwind (cession de Purecontrol le 16/09, DAF nommé le 07/09) ·
Cité Marine (40 M€ d'investissement Morbihan, ~38 offres actives, date non confirmée) ·
Maisons Pariente (nouvelle DRH, ouverture Saint Roch Courchevel en décembre 2026).

---

## 6. Filtres appliqués

**Anti-doublons 14 jours :** 215 entreprises issues de 32 fichiers CSV (15 → 25/09) exclues de la
recherche. Contrôle programmatique dans chaque agent : **0 collision** sur les 5 fichiers livrés.

**Plafond effectif groupe < 2000 salariés :** entreprises écartées pendant la recherche —
Suez, Fives, Covéa, Crédit Agricole, Société Générale, Chausson Matériaux, Knauf, Amphenol,
ID Logistics, Record/Assa Abloy, Actemium/Vinci, Massilly, Bertin/CNIM, Pigeon Granulats, Symrise,
Staub/Zwilling, PPG, Cooperl, Atlantic, Arabelle Solutions, Verisure, Sector Alarm, Timac Agro
(Roullier), Cultura, CHEP, Primagaz, MAN FS, Finimetal (Purmo ~7000 sal), Groupe Berto (~3000 sal),
Larivère, MasterGrid, CHG-Meridian, Schmidt Groupe, Ponticelli, Point.P, Eureden, Laboratoires UMA.

**Groupes hôteliers exclus par principe :** Accor, Marriott, Hilton, IHG, Hyatt, Rosewood,
Four Seasons, Mandarin Oriental. Écartés à ce titre ou pour doublon : Le Bristol (Oetker),
Hôtel Sax (Hilton), Château de Cîteaux (Fontenille Collection), Summer Hotels, Maisons Pariente,
Domaine Les Crayères.

**Liste noire respectée :** aucun Big 4, next tier, réseau d'expertise comptable, scale-up
surmédiatisée ni CAC 40 dans les livrables. Sales SaaS : Oodrive, Doctrine, iAdvize, Modjo, Dastra,
Siteflow, Tenacy, Zei écartés (ex-FT120 ou déjà ciblés).

**Cabinets masquant l'employeur final écartés :** L'Heureux Talent, Genesis RH, Talenteeds, Projex,
Imperium, Tryon, SwiftTalent, Vidal Associates, Fed Finance, Michael Page.

**Exclusion alternance / stage :** appliquée sur tous les intitulés retenus.

---

## 7. Dédoublonnage Sales Méroë ↔ Louis

Dédoublonnage exécuté sur la colonne `entreprise` (normalisation casse et espaces) :
**0 entreprise retirée**, le fichier de Méroë conserve ses **40 lignes / 20 entreprises**.
Les deux agents Sales ont travaillé sur des périmètres disjoints — Louis sur les éditeurs SaaS et
tech B2B, Méroë sur l'industrie, le négoce technique, le transport, les services au bâtiment,
la télécom B2B, les ENR et l'agroalimentaire — ce qui a évité tout chevauchement en amont.

---

## 8. Points de vigilance à valider avant appel

- **CAP INGELEC** (Industrie) — effectif groupe non vérifié, à confirmer sous 2000 salariés.
- **SEFI** (Sales) — 45 agences annoncées, effectif groupe à confirmer.
- **Groupe Galopin** (Sales) — effectif groupe non confirmé.
- **Groupe Charlois** (Finance) — localisation et effectif en `NC`.
- **Obat** (Sales SaaS) — levée de 12 M€ confirmée mais **date non confirmée**, potentiellement
  antérieure à 30 jours : à vérifier avant de l'utiliser comme signal news.
- **Ouest Conseils** (Finance) — annonce datée du 19/09, légèrement hors fenêtre 7 jours.
- **Groupe Daniel** (Sales) — annonce du 29/07, hors fenêtre 7 jours, conservée pour la qualité
  du signal (Directeur Commercial au CODIR pilotant ~15 commerciaux).
- **CENISIS LILLE** (Finance) — 20-49 salariés, CA 3,0 M€ : retenue au titre de la tolérance 5-50 sal.

---

## 9. Fichiers livrés

| Fichier | Destinataire |
|---|---|
| `outputs/finance_2026-09-29.csv` | Valentin Murcia |
| `outputs/hospitality_2026-09-29.csv` | Valentin Murcia |
| `outputs/industrie_2026-09-29.csv` | Alexis |
| `outputs/sales_saas_2026-09-29.csv` | Louis |
| `outputs/sales_2026-09-29.csv` | Méroë Nguimbi |
| `outputs/humanup_market_mapping_2026-09-29.xlsx` | Méroë Nguimbi (consolidé 6 onglets) |
| `outputs/rapport_synthese_2026-09-29.md` | Méroë Nguimbi |

Fichiers intermédiaires Finance conservés : `_fin_a_`, `_fin_b_`, `_fin_c_2026-09-29.csv`.
