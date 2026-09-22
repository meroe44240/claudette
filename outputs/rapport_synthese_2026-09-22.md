# Rapport de synthèse — Market Mapping Humanup.io — 2026-09-22

> ## ⚠️ RUN DÉGRADÉ — À LIRE AVANT EXPLOITATION
> Le budget WebSearch de la session (200 requêtes, partagé entre tous les agents) a été
> **épuisé après environ un quart du travail**. En parallèle, l'egress proxy renvoie 403 sur
> **tous** les sites de sourcing utiles — France Travail, APEC, HelloWork, Indeed, LinkedIn,
> Welcome to the Jungle, Pappers, Societe.com, Journal des Palaces, L'Hôtellerie Restauration,
> Usine Nouvelle, Maddyness, FrenchWeb — en WebFetch **et** en curl direct.
>
> Conséquences concrètes :
> - **130 lignes livrées sur 200 attendues** (65 %).
> - **14 contacts nominatifs sur 130 lignes (11 %)** — le reste est tagué `CONTACT_NON_SOURCE`.
> - **La fraîcheur 7 jours des annonces JOB n'est pas garantie** : les pages d'annonces
>   n'ont pas pu être ouvertes, donc `Date: NC` sur la majorité des lignes. Les annonces
>   sont confirmées *actives* au 22/09, mais pas nécessairement *publiées* dans les 7 jours.
> - Les **signaux NEWS sont, eux, correctement datés et sourcés** — c'est la partie la plus
>   fiable du livrable du jour.
>
> Aucune donnée n'a été inventée. Les agents ont appliqué la règle « intégrité > volume ».

---

## 1. Volumes par verticale

| Fichier | Destinataire | Lignes | Cible | Entreprises | Contacts sourcés | % sourcé |
|---|---|---:|---:|---:|---:|---:|
| `finance_2026-09-22.csv` | Valentin Murcia | 40 | 40 | 19 | 6 | 15 % |
| `hospitality_2026-09-22.csv` | Valentin Murcia | 40 | 40 | 20 | 2 | 5 % |
| `industrie_2026-09-22.csv` | Alexis | **10** | 40 | 5 | **0** | 0 % |
| `sales_saas_2026-09-22.csv` | Louis | 36 | 40 | 18 | 4 | 11 % |
| `sales_2026-09-22.csv` | Méroë Nguimbi | **4** | 40 | 2 | 2 | 50 % |
| **TOTAL** | | **130** | **200** | **64** | **14** | **11 %** |

Deux verticales sont en échec de volume : **Industrie (10/40)** et **Sales général (4/40)**.
Leurs agents ont démarré après épuisement du budget de recherche et n'ont eu accès à
quasiment aucune source exploitable.

Répartition JOB / NEWS demandée : 14 JOB + 6 NEWS par verticale. Non tenue partout —
Hospitality livre 19 JOB / 1 NEWS, Sales SaaS 16 JOB / 2 NEWS, Industrie 0 JOB / 5 NEWS.

## 2. Top régions / villes / secteurs

**Régions les plus représentées**
1. **Bretagne** (56, 35, 22) — Sigmaphi (Saint-Avé), Altho/Brets (Noyal-Pontivy), Groupe Okwind (Torcé)
2. **Auvergne-Rhône-Alpes** (69, 73, 74) — Hackuity et Endrix (Lyon), Le Chabichou (Saint-Bon-Tarentaise), Le M de Megève, Hôtel Alpaga, Savoisienne Habitat (Chambéry)
3. **Pays de la Loire** (44, 49, 53) — Altonéo (Laval/Angers), VDCOM (Nantes)
4. **Normandie** (76, 27) — VALGO (Petit-Couronne), Kerogo Finance (Rouen), REBORN/XL Recycling (Bernay)
5. **Île-de-France** — concentrée sur Sales SaaS et Hospitality (DJUST, Inpulse, Jimini AI, Esprit de France, Fabulous Hotels)

**Villes récurrentes** : Lyon, Rouen, Paris, Saint-Avé, Angers/Laval, Megève.

**Secteurs porteurs du jour** : expertise comptable en consolidation (build-ups Kerogo/Endrix),
industrie bretonne en extension de capacité, hôtellerie de montagne en pré-saison hiver
2026-2027, cybersécurité / legaltech côté SaaS.

## 3. Top 7 signaux business prioritaires

1. **Hackuity** (Lyon) — Série B **16 M€ / 19 M$** le 16/09/2026, lead **Forgepoint Capital
   International** + Bright Pixel, Seventure Partners, Bpifrance Deeptech Venture. Déploiement
   international, objectif de doublement du CA d'ici fin 2028. → *Fichier Louis.*
2. **Kerogo Finance** (Rouen) — double build-up **Arditti** (Marseille) + **Tamet**
   (Saint-Étienne) le 03/09/2026, franchit **90 M€ de CA**, ouvre deux villes du Sud-Est,
   adossé à **Perwyn**. Besoin d'intégration et de staffing immédiat. → *Fichier Valentin.*
3. **Endrix** (Lyon) — 3 rapprochements simultanés (Audrex, Expand CPA, Lyon Expertise),
   CA **100 → 160 M€** en un an, **IK Partners + Bpifrance**, cap 300 M€ en 2030. → *Valentin.*
4. **Sigmaphi** (Saint-Avé, 56) — usine de **11 M€** inaugurée le **17/09/2026**, 6 200 m²,
   160 salariés, **+20 recrutements d'ici 2028**, diversification fusion nucléaire.
   → *Double accroche : contrôle de gestion industriel (Valentin) ET production (Alexis).*
5. **VALGO** (Petit-Couronne, 76 — 500-999 sal, CA 118,7 M€) — **Aurélie Glas** nommée **DAF
   et membre du comex** en septembre 2026, ex-Suez/Veolia, sur 39 établissements. Nouveau CFO
   externe = recrutements finance quasi certains. → *Valentin.*
6. **Altho / Brets** (Noyal-Pontivy, 56) — usine de **36 000 m²** inaugurée le **17/09/2026**
   + **47 M€** annoncés pour un entrepôt automatisé (98 M€ cumulés 2025-2026). → *Alexis.*
7. **Altonéo** (Laval / Angers) — **230 → 280 collaborateurs**, CA > 25 M€, **9 postes ouverts
   simultanément sur 5 agences**, cap des 300 salariés visé fin 2026. → *Valentin.*

**Signal secondaire notable** : **Savoisienne Habitat** (Chambéry) — Guillaume Facq promu
RAF → DAF, le poste de RAF est de fait libéré.

## 4. Récurrences — entreprises déjà ciblées qui rebougent

38 entreprises vérifiées sur les 296 du fichier d'exclusion 14 jours (sélection ETI, groupes
industriels, scale-ups, hôtellerie, sociétés sous LBO). **2 récurrences confirmées** sur la
fenêtre stricte 2026-09-15 → 2026-09-22 :

- **Groupe Okwind** (Torcé, 35) — le **16/09/2026**, cession de l'intégralité de sa
  participation dans **Purecontrol** et recentrage sur l'autonomie énergétique ; nouvelle
  gamme MEA Stock 209 présentée au SPACE de Rennes. Recentrage + nouveau DAF nommé début
  septembre = fenêtre de réorganisation d'équipes.
  [Source](https://www.abcbourse.com/marches/okwind-cede-sa-participation-dans-purecontrol-et-se-recentre-sur-lautonomie-ene_702608)
- **Jimini AI** (Paris) — le **15/09/2026**, partenariat avec le **Conseil National des
  Barreaux** : accès gratuit pour **4 000 élèves-avocats** des 11 écoles d'avocats françaises.
  Déploiement national à cette échelle = besoin de renforts customer success / sales.
  [Source](https://www.maddyness.com/2026/09/15/cnb-jimini-ai-juridique-ecoles-avocats/)

**Signaux proches mais hors fenêtre stricte** (à ne pas utiliser comme « actu de la semaine »,
datés du 31/07 au 11/09) : Cailabs (usine Factory 27), VALOREM (PPA Google + nouveau DG),
Groupe Sud Ouest (négociations de rachat par Rossel), Groupe Prévoir (nouveau DAF Groupe),
Voyageurs du Monde (OPR Avantage), Groupe Deret (négociations Geodis), Okko Hotels
(5e établissement parisien), Cem'In'Eu.

Lot non couvert faute de budget de recherche : ORCOM, Soregor, Cogedis, MagREEsource,
Microphyt, Alliance Étiquettes, Lingenheld, Plattard, Tanguy Matériaux.

## 5. Filtres appliqués

**Anti-doublons 14 jours** — 296 entreprises déjà ciblées entre le 2026-09-08 et le 2026-09-22
ont été extraites des CSV précédents et exclues. **0 collision** sur les 5 fichiers livrés.

**Plafond strict < 2000 salariés au niveau groupe** — ont été écartés à ce titre : Aldes
(~2000), Vandemoortele, MSD France, Naval Group, Safran, Socotec, Liebherr, Claas, Alfa Laval,
SGL Carbon, Symrise, Phyteurop Industry (filiale InVivo), Boulanger, Oney, Groupe VYV, SETEC,
Babilou, emeis, CHEP, Nissan France, Veolia, Evoriel, Xpollens, Hôpital Privé des Côtes d'Armor,
Free2move (Stellantis).

⚠️ **À vérifier avant exploitation** : **DistriCenter** (fichier Finance) — effectif annoncé
1001-5000 sur LinkedIn, non recoupé faute d'accès à Pappers. À confirmer sous le plafond
des 2000 avant d'attaquer.

**Liste noire appliquée** — Deloitte, BDO, Cerfrance, Exco, In Extenso, RSM (cabinets) ;
Pennylane, Agicap, Dashdoc, Mistral AI (scale-ups surmédiatisées).

**Hôtels de groupe** — 0 établissement Accor / Marriott / Hilton / IHG / Hyatt / Rosewood /
Four Seasons / Mandarin Oriental dans le fichier Hospitality.

**Cabinets masquant l'employeur final** — écartés : Fed Finance, Michael Page, Manpower,
Proman, Partnaire, Temporis, AELIOS, Uptoo, Ignition Program, La Relève, Achil, Job Link,
Dream Catcher Sales, Job2beDone, JOBGLOBER, Réseau Talents.

**Alternance / stage** — aucune annonce retenue.

## 6. Dédoublonnage Sales (Louis → Méroë)

**0 entreprise retirée.** Les 2 entreprises du fichier de Méroë (Javey, VDCOM) ne figurent pas
dans `sales_saas_2026-09-22.csv`. Le sous-volume du fichier de Méroë (4 lignes) est
**entièrement dû au blocage infrastructure**, pas au dédoublonnage.

À noter : **Altonéo** apparaît à la fois dans Finance A et Finance B (2 opportunités
distinctes, 4 lignes au total) — d'où 19 entreprises uniques pour 20 opportunités dans le
fichier Finance. C'est un doublon intra-fichier assumé : les deux angles d'approche diffèrent.

⚠️ **VDCOM** (Nantes) est marquée « À REQUALIFIER » : annonce en direct, employeur non masqué,
mais date de publication invérifiable.

## 7. Actions recommandées

1. **Attaquer en priorité les 7 signaux NEWS ci-dessus** — ce sont les seuls à être datés,
   sourcés et vérifiables. Les lignes JOB sont à requalifier avant appel.
2. **Vérifier DistriCenter** (plafond 2000) et **VDCOM** (fraîcheur) avant prospection.
3. **Débloquer l'infrastructure avant le run de demain**, sans quoi le problème se répétera :
   - relever `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` (200 est insuffisant pour 8 agents —
     il en faudrait ~600-800), ou réduire le nombre d'agents lancés en parallèle ;
   - autoriser dans la policy d'egress au minimum : `francetravail.fr`, `apec.fr`,
     `hellowork.com`, `indeed.fr`, `pappers.fr`, `journaldespalaces.com`, `usinenouvelle.com`,
     `maddyness.com`.
4. **Relancer les verticales Industrie et Sales général** une fois l'infrastructure corrigée —
   elles sont quasi vides aujourd'hui.
5. **Consolider `main`** : la branche `main` du dépôt est restée au 2026-09-16 et accuse
   10 commits de retard (les runs des 17, 18 et 22 septembre vivent sur leurs branches
   quotidiennes respectives).

---

*Généré le 2026-09-22 — 8 agents de recherche, 130 lignes livrées sur 200 attendues.*
