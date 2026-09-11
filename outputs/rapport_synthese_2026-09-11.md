# Rapport de synthèse — Market mapping Humanup.io

**Date : 2026-09-11**

> ⚠️ **RUN DÉGRADÉ — 118 lignes livrées sur 200 attendues (59 %).**
> Le quota WebSearch de la session (200 recherches, partagé entre les 7 sous-agents) a été épuisé
> en cours de run, et le proxy d'egress a bloqué en 403 la quasi-totalité des sites FR utiles.
> Détail et correctif en fin de rapport. **Aucune donnée n'a été inventée** : le déficit est assumé
> en volume, pas en qualité.

---

## 1. Volumes par vertical

| Destinataire | Fichier | Lignes | Cible | Entreprises | Contacts sourcés | JOB | NEWS |
|---|---|---|---|---|---|---|---|
| Valentin — Finance | `finance_2026-09-11.csv` | **40** | 40 | 20 | 14 / 40 | 32 | 8 |
| Valentin — Hospitality | `hospitality_2026-09-11.csv` | **40** | 40 | 20 | 1 / 40 | 34 | 6 |
| Alexis — Industrie | `industrie_2026-09-11.csv` | **12** | 40 | 6 | 4 / 12 | 0 | 12 |
| Louis — Sales SaaS | `sales_saas_2026-09-11.csv` | **22** | 40 | 11 | 0 / 22 | 20 | 2 |
| Méroë — Sales | `sales_2026-09-11.csv` | **4** | 40 | 2 | 2 / 4 | 4 | 0 |
| **TOTAL** | | **118** | 200 | **59** | **21 / 118** | 90 | 28 |

Finance et Hospitality sont au volume cible. Industrie, Sales SaaS et Sales général sont
sous-livrés : ces trois agents ont été coupés en plein sourcing par l'épuisement du quota.

**Taux de sourcing nominatif : 21/118 (18 %)**, très en dessous du niveau habituel — LinkedIn,
Pappers et Societe.com étant inaccessibles, le sourcing n'a pu s'appuyer que sur les snippets.
Les 97 lignes restantes sont tagguées `CONTACT_NON_SOURCE` : **entreprise, poste cible et contexte
sont valides**, seul le nom manque → candidates directes à un enrichissement FullEnrich / ATS.

---

## 2. Top régions / villes / secteurs

**Villes les plus représentées**
- Paris (75) — 26 lignes (surtout Sales SaaS et Finance)
- Megève (74) et Courchevel (73) — 10 lignes cumulées (saison hiver 26-27)
- Nantes (44) — 6 lignes
- Lyon (69), Lille (59), Courbevoie (92) — 2 à 4 lignes chacune

**Régions**
- **Industrie : 100 % hors Île-de-France** — Bretagne (56, 44), Nouvelle-Aquitaine (79, 64),
  Pays de la Loire, Grand Est, Occitanie. Règle géographique Alexis parfaitement respectée.
- **Hospitality : forte concentration Alpes** (8 opportunités sur 20) — conséquence directe de la
  coupure de quota : Alsace, Normandie, Bordelais et les groupes de restauration n'ont pas pu être couverts.
- **Sales SaaS : concentration parisienne** (12 lignes sur 22).

**Secteurs**
- Finance : ETI familiales et cabinets indépendants régionaux (Babolat, Le Gouessant, Groupe Cofimé,
  GMBA, Transports Breger)
- Hospitality : hôtellerie indépendante et petits groupes familiaux (Casadelmar, Beaumier, Groupe PVG,
  Hôtels & Préférence)
- Industrie : menuiserie alu, agroalimentaire, plasturgie, nutrition animale
- Sales SaaS : éditeurs B2B mid-market (Leeto, DiliTrust, iAdvize, Partoo, Eudonet, Skillup)

---

## 3. Top 7 signaux business prioritaires

1. **FenêtréA** (Beignon, 56) — nouvelle usine alu 20 000 m² à 30 M€ pour 2027, **plus un lotissement
   de 41 maisons construit à 7 M€ pour loger ses futurs salariés**. ~100 recrutements et un aveu
   public de difficulté de sourcing : c'est le signal le plus chaud du jour, toutes verticales confondues.
   PDG Dominique Lamballe sourcé.
2. **Groupe Lafourcade** (Châtillon-sur-Thouet, 79) — 20 M€ investis sur 3 sites simultanément,
   groupe indépendant de 15 sociétés à 120 M€ de CA. Président Amaury Lafourcade sourcé.
3. **Groupe Cofimé** (Colmar, 68) — prise de participation majoritaire dans Ceralp : passage de
   250 à ~350 collaborateurs sur 15 sites. Un groupe d'expertise comptable indépendant qui doit
   staffer ses nouveaux sites — mandat multi-postes probable. PDG et DG délégué sourcés.
4. **Transports Breger** (Laval, 53) — RAF Groupe membre du CoDir : transporteur familial indépendant,
   1 070 salariés, 12 agences. Profil « dark horse » idéal.
5. **Comexposium** (Courbevoie, 92) — 3 postes de contrôle de gestion ouverts en parallèle
   (généraliste, sociale, frais généraux/IT & Capex) : reconstruction complète de l'équipe.
6. **Au Cœur du Village Hôtel & Spa / Groupe PVG** (La Clusaz, 74) — recherche son **Directeur d'hôtel**
   avant la saison d'hiver. Relais & Châteaux, groupe familial savoyard : mandat à forte valeur unitaire.
7. **Oxalys** — prise de participation majoritaire / build-up international par **Main Capital Partners**
   (via cisbox), sortie de Société Générale Capital Partenaires, 08/09/2026. Seule opération PE
   pleinement vérifiable de la journée.

---

## 4. Récurrences — entreprises déjà ciblées qui redonnent signal

21 des 501 entreprises de la liste d'exclusion ont pu être re-vérifiées avant l'épuisement du quota.
**5 signaux frais dans la fenêtre stricte 04→11 septembre :**

- **Ekimetrics** — Accor renforce et internationalise son partenariat marketing (annonce du 10/09).
  [source](https://www.cbnews.fr/conseil/accor-renforce-son-partenariat-avec-ekimetrics-piloter-ses-investissements-marketing)
- **VALOREM** — PPA long terme avec Google (éolien terrestre Finlande, 09/09), doublé du recrutement
  de Denis Joubrel (ex-Michelin) comme Directeur Financier.
  [source](https://www.valorem-energie.com/en/news/)
- **Tekever France** — premier drone AR3 sorti de l'usine de Cahors présenté le 09/09, dans un plan
  de 200 M€ / 200 emplois en Occitanie–Nouvelle-Aquitaine (~100 collaborateurs visés fin 2026).
  [source](https://medialot.fr/tekever-annonce-sa-presence-aux-journees-des-drones-de-cahors/)
- **Hublo** — plus de 25 offres ouvertes au 09/09 pour une équipe de ~200 personnes.
  [source](https://fr.indeed.com/q-hublo-emplois.html)
- **Figeac Aéro** — conseil d'achat confirmé par TP ICAP Midcap le 07/09 après un CA T1 de 111,8 M€
  (+11,6 % organique), montée en cadence A350 / A320 / 737.
  [source](https://www.boursorama.com/cours/actualites/1rPFGA/?symbole=1rPFGA)

**Signaux limites (8-11 jours, hors fenêtre stricte mais exploitables) :** Cailabs (première pierre
de « Factory 27 » à Rennes le 03/09, ~100 créations d'emplois), Carester (accord d'enlèvement 10 ans
avec Lindian Resources le 03/09), Voyageurs du Monde (projet d'OPR déposé à l'AMF le 01/09).

**Faux positif écarté :** Okko Hotels « Paris Rosa Parks » ressort en septembre 2026 mais l'ouverture
date de juin 2023.

---

## 5. Dédoublonnage Sales (Louis ↔ Méroë)

- Lignes dans le fichier de Méroë avant dédoublonnage : **4**
- Entreprises retirées car déjà présentes chez Louis : **0**
- Lignes livrées à Méroë : **4**

Aucun recouvrement : les 2 entreprises de Méroë (SFH, AKEMA Technologies) sont industrielles et
n'apparaissent pas dans le fichier SaaS de Louis. Le fichier de Méroë est **très en dessous des
40 lignes** — non pas à cause du dédoublonnage, mais de l'épuisement du quota de recherche.

---

## 6. Filtres appliqués

- **Anti-doublons** : 501 entreprises ciblées sur les 14 derniers jours exclues de la recherche.
  Aucune entreprise n'avait été ciblée 2 jours distincts sur la période — le filtre tient proprement.
- **Plafond strict < 2000 salariés au niveau du groupe** : ont notamment été écartés Volvo Car France,
  Nissan France, Geodis, JCDecaux, Agrial, Lesaffre, EssilorLuxottica, M+ Matériaux (groupe SAMSE),
  Groupe Bigard, Fayat, Symrise, PPG, Rockwool, Danone, Alstom, Safran, Saint-Gobain PAM,
  ainsi que HR Path (> 2000 sal.) côté SaaS.
- **Groupes hôteliers exclus** : Accor, Marriott, Hilton, IHG, Hyatt, Barrière, LVMH, Dorchester, Meliá.
- **Liste noire** : Big 4, next tier, réseaux EC (In Extenso, Fiducial, Cerfrance, Exco, Sofarec),
  scale-ups surmédiatisées, CAC 40. Brevo écarté (trop visible).
- **Cabinets masquant le client final** écartés : Samsic, Manpower, Approach People, Michael Page,
  Synergie, Effektiv, Pay Job, Réseau Talents, Adsearch, Talents AEC, Achil.
- **Exclusion alternance / stage / apprentissage** : appliquée, 0 annonce de ce type retenue.
- **Exclusion < 5 salariés** : appliquée (Yellodit conservé mais effectif marqué `NC` — à valider).

---

## 7. Incident technique — à traiter avant le run de lundi

**Cause racine : le quota WebSearch est un budget de session partagé (200 recherches), pas un budget
par sous-agent.** Les 7 agents verticaux lancés en parallèle l'ont consommé collectivement ; ceux qui
ont terminé leur plan en dernier (Industrie, Sales SaaS, Sales général) ont été coupés en plein
sourcing. Les trois fichiers sous-livrés sont exactement ceux-là.

**Facteur aggravant : le proxy d'egress bloque en 403 la quasi-totalité des sources françaises** —
France Travail, APEC, HelloWork, LinkedIn, Pappers, Societe.com, Welcome to the Jungle, Journal des
Palaces, L'Hôtellerie Restauration, L'Usine Nouvelle, Journal des Entreprises, CFNews, Maddyness,
FrenchWeb, et jusqu'aux sites corporate des entreprises ciblées. **Aucun WebFetch n'a abouti de tout
le run.** Tout le travail s'est fait sur les snippets WebSearch, ce qui explique à la fois le faible
taux de sourcing nominatif et les nombreux `Date: NC`.

**Conséquences sur la qualité — à connaître avant d'appeler :**
- **Les dates de publication des annonces n'ont pas pu être confirmées** sur la majorité des lignes.
  La règle « annonces des 7 derniers jours » n'est donc **pas garantie** ce jour. Les dates non
  vérifiées sont explicitement marquées `Date: NC` ou « date de publication non confirmée » plutôt
  qu'inventées.
- Deux signaux sont **identifiés comme hors fenêtre** et signalés en clair dans les notes :
  Le Gouessant (annonce de mars 2026 relayée le 04/09) et Waterair (fin juin 2026).
- **Ucopac** est la ligne la plus fragile du lot (ville, effectif et montant en `NC`) — à arbitrer.
- Les effectifs groupe n'ont pas pu être vérifiés via Pappers : `EFFECTIF_RANGE = NC` sur une grande
  partie des lignes, le plafond < 2000 étant présumé mais non prouvé pour FenêtréA et Lafourcade.

**Correctifs proposés, par ordre d'efficacité :**
1. **Relever `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`** (200 → 500+). C'est le correctif à plus
   fort effet : il débloque à lui seul les trois verticales sous-livrées.
2. **Séquencer les agents par vagues** (3 puis 4) avec un budget de recherche explicite annoncé à
   chacun, au lieu de 7 en parallèle sur un pot commun.
3. **Autoriser explicitement `search_people_external` (FullEnrich, 0,25 crédit/résultat)** pour le
   sourcing nominatif : 97 lignes n'attendent qu'un nom, l'entreprise et le poste cible étant déjà cadrés.
4. Vérifier auprès de l'admin réseau si les domaines emploi/presse FR peuvent être mis en liste
   blanche sur le proxy.

---

## 8. Fichiers livrés

| Fichier | Destinataire |
|---|---|
| `outputs/finance_2026-09-11.csv` | Valentin Murcia |
| `outputs/hospitality_2026-09-11.csv` | Valentin Murcia |
| `outputs/industrie_2026-09-11.csv` | Alexis |
| `outputs/sales_saas_2026-09-11.csv` | Louis |
| `outputs/sales_2026-09-11.csv` | Méroë Nguimbi |
| `outputs/humanup_market_mapping_2026-09-11.xlsx` | Méroë Nguimbi (6 onglets) |
| `outputs/rapport_synthese_2026-09-11.md` | Méroë Nguimbi |

Format : 11 colonnes, séparateur `;`, UTF-8 BOM, CRLF — import Propium direct.
