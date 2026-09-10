# Rapport de synthèse — Market Mapping Humanup.io — 2026-09-10

> ⚠️ **RUN DÉGRADÉ.** Le budget WebSearch de la session (200 requêtes) a été épuisé alors que les 7 agents de sourcing tournaient en parallèle, et l'egress web direct (WebFetch/curl) a été bloqué par le proxy sur la totalité des sites cibles (APEC, HelloWork, Indeed, LinkedIn, Welcome to the Jungle, Pappers, Societe.com, France Travail, DAF-Mag, CFNews, L'Usine Nouvelle, Journal des Palaces…).
> **Conséquences à connaître avant d'attaquer les fichiers :** 152 lignes livrées sur 200 attendues, 9 contacts nominatifs sur 152, effectifs quasi tous en `NC` (plafond 2000 salariés non vérifiable par la base), et **la fenêtre de fraîcheur 7 jours n'a pas pu être vérifiée sur la majorité des annonces** — les dates réelles connues sont reportées telles quelles dans le champ `notes`, à filtrer côté équipe.
> Conformément à la règle d'intégrité : **aucune donnée n'a été inventée.** Ce qui n'était pas confirmé est marqué `NC`, et les contacts non sourcés portent le tag `CONTACT_NON_SOURCE` plutôt qu'un nom plausible.

---

## 1. Volumes par verticale

| Verticale | Destinataire | Fichier | Lignes (cible 40) | Entreprises | Contacts sourcés | Opportunités |
|---|---|---|---|---|---|---|
| Finance | Valentin | `finance_2026-09-10.csv` | 32 | 16 | 2 / 32 | 12 JOB + 4 NEWS |
| Hospitality | Valentin | `hospitality_2026-09-10.csv` | **40** | 20 | 2 / 40 | 14 JOB + 6 NEWS |
| Industrie | Alexis | `industrie_2026-09-10.csv` | 24 | 12 | 3 / 24 | 7 JOB + 5 NEWS |
| Sales SaaS | Louis | `sales_saas_2026-09-10.csv` | 26 | 13 | 0 / 26 | 12 JOB + 1 NEWS |
| Sales général | Méroë | `sales_2026-09-10.csv` | 30 | 15 | 2 / 30 | 12 JOB + 3 NEWS |
| **TOTAL** | | | **152 / 200** | **76** | **9 / 152** | **57 JOB + 19 NEWS** |

Seule la verticale Hospitality atteint la cible de 40 lignes. Les quatre autres sont en dessous : l'épuisement du budget de recherche a stoppé le sourcing avant complétion, et le mode best-effort a été appliqué (livrer du réel incomplet plutôt que compléter avec de l'approximatif).

---

## 2. Top régions / villes / secteurs

**Départements dominants :** Paris 75 (30 lignes) — Hauts-de-Seine 92 (8) — Bouches-du-Rhône 13 (8) — Ille-et-Vilaine 35 (8) — Gironde 33 (6) — Rhône 69 (6) — Haute-Garonne 31 (6) — Loire-Atlantique 44 (6) — Seine-Saint-Denis 93 (4) — Pas-de-Calais 62 (4) — Isère 38 (4).

**Villes les plus représentées :** Paris, Puteaux, Lyon, Boulogne-Billancourt, Toulouse, Aix-en-Provence, Rennes, Bordeaux.

**Lecture géographique :** la consigne « privilégier les régions » a bien tenu sur l'Industrie (Blanquefort 33, Angres 62, Dunkerque 59, Céret 66, Sainte-Luce-sur-Loire 44, Rennes/Vitré 35) et sur l'Hospitality (PACA, Savoie-Isère, Bourgogne, Occitanie). Elle a moins tenu sur Sales SaaS et Finance, structurellement parisiennes.

**Secteurs porteurs du jour :** industrie de la batterie et de la chimie (Hauts-de-France), composites et matériaux (Nouvelle-Aquitaine), hôtellerie indépendante de montagne et de littoral, legaltech / IA appliquée, distribution industrielle B2B, expertise-comptable indépendante en consolidation.

**Plateformes sources :** Welcome to the Jungle (28) — HelloWork (24) — Le Journal des Entreprises (16) — L'Hôtellerie-Restauration (16) — Journal des Palaces (14) — LinkedIn Jobs (14) — Taleez (6).

---

## 3. Top 7 signaux business prioritaires

1. **Enchem France — Dunkerque (59)** — Mise en service d'une usine d'électrolytes pour batteries, 57 M€ investis. Montée en puissance production + maintenance sur plusieurs mois. *Le plus gros gisement de volume industriel du jour.* → Alexis
2. **Palchem — Angres (62)** — 15 M€ dans une nouvelle unité de production (projet SYNTERRA) ; effectif de 35 appelé à doubler en 5 ans. Structure indépendante, taille idéale, croissance financée. → Alexis
3. **CMP Composites — Blanquefort (33)** — Emménagement le 01/09/2026 dans une usine neuve de 4 500 m² (>5 M€), cap 100 salariés en 2030. Dark horse parfait : PME indépendante en phase de scale industriel. → Alexis
4. **S4E Software — Lorient (56)** — MBO finalisé, management majoritaire, UI Investissement + pool BPGO/CEBPL. Nouvelle phase de développement international = recrutement commercial à prévoir. *Seule opération PE réellement confirmée du jour.* → Louis
5. **Roussillhotel — Saint-Cyprien (66)** — Rachat de l'Hôtel & Spa Les Mouettes 4* à Argelès-sur-Mer (15 sal. saison, 1,3 M€ CA). Petit groupe hôtelier indépendant en croissance externe. → Valentin
6. **Cem'In'Eu** — Brice Gay-Matos nommé Directeur Commercial et Marketing (succession d'Olivier Evrain, retraite), en parallèle d'une évolution de gouvernance et des capacités de production. Cimentier français indépendant : nouveau décideur commercial = fenêtre d'approche. → Méroë
7. **SEC3 — Vincennes (94)** — Fusion officialisée le 04/09/2026 avec le groupe Aurys, renforcement Île-de-France. Cabinet indépendant hors Big 4 / hors réseaux, en consolidation. → Valentin

**Mentions complémentaires :** Sowell (ouverture Nîmes Centre Arènes le 21/08/2026, 30 emplois créés) ; Madame Rêve Paris 1er (nouvelle table du chef Tom Meyer depuis le 03/09/2026) ; Michaud Chailly Annecy (74) — *seule annonce du run strictement datée dans la fenêtre 7 jours, publiée le 08/09/2026* ; TEORHEM Grand Est (deux postes de Responsable Commercial ouverts simultanément = extension de force de vente + ouverture Allemagne) ; MEOGROUP Boulogne-Billancourt (structuration de la fonction paie interne) ; Jimini AI Paris (création d'un poste Head of Sales, legaltech IA).

---

## 4. Recurrences

Détection menée sur 56 entreprises parmi les plus identifiables des 425 déjà ciblées ces 14 derniers jours, fenêtre de fraîcheur 2026-09-03 → 2026-09-10.

- **EPSA** (Paris) — *croissance externe* — Le groupe rachète la totalité d'**Energiency**, éditeur SaaS/IA rennais de pilotage de la performance énergétique industrielle, après une première prise de participation en 2023. Source : Bretagne Économique, article daté du 4 septembre 2026 — https://www.bretagne-economique.com/actualites/energiency-35-repris-par-le-groupe-epsa/
  *Réserve :* EPSA déclare 3 200 collaborateurs (dont 1 100 en France) — **au-dessus du plafond 2000 au niveau groupe**. Le signal exploitable est du côté d'**Energiency (Rennes)**, la cible rachetée, pas de l'acquéreur.

**Signaux proches écartés faute de date dans la fenêtre :** Audencia (campus Paris Saint-Ouen, 02/09), Figeac Aéro (CA T1 26/27, 02/09), Mecalac et Precia Molen (horodatages d'agrégateur, non étayés).

**Couverture incomplète :** le budget de recherche s'est épuisé avant les segments hôtellerie/restauration haut de gamme (La Tour d'Argent, La Réserve Paris, Fontenille Collection, Zannier Hotels), vins et champagnes (Henriot, M. Chapoutier) et finance immobilière (Foncière Inea, Præmia REIM, ClubFunding) — soit ~15 cibles à reprendre au prochain passage.

---

## 5. Filtres appliqués

**Anti-doublons :** les 425 entreprises ciblées entre le 2026-08-27 et le 2026-09-09 ont été extraites des CSV précédents et exclues de la recherche. Vérification par `grep` insensible à la casse dans chaque agent. **Zéro doublon** avec l'historique 14 jours dans les 5 fichiers livrés.

**Plafond 2000 salariés (groupe) :** appliqué, mais **partiellement vérifiable seulement** — Pappers et Societe.com étant bloqués par le proxy, l'exclusion n'a pu se faire que sur les entreprises dont la taille était déjà connue. Écartées à ce titre : Veolia, Suez, Enedis, BME France, SETEC, Groupe ETAM, OGF, Caisse d'Épargne IdF, emeis, Bouygues Construction, Boiron, Dexis/Descours & Cabaud, Pro à Pro, Castorama, Knauf, Webedia, HR Path. **Les effectifs marqués `NC` dans les fichiers n'ont pas pu être confirmés : à valider avant tout démarchage.**

**Liste noire :** appliquée intégralement (Big 4, next tier, réseaux EC, scale-ups surmédiatisées, CAC 40). Écartés côté SaaS pour cause de sur-visibilité : Agicap, Partoo, 360Learning, Brevo, Pennylane.

**Cabinets masquant l'employeur final :** écartés — Randstad, Supplay, FYTE, Michael Page, WellJob, Proavenir, Mercato, Golden Bees, Pay Job, Job Link, Adsearch, Crit, Fed Finance, Externatic, Uptoo, Achil, Dream Catcher.

**Alternance / stage / apprentissage :** aucune annonce de ce type retenue.

**Dédoublonnage Sales Louis ↔ Méroë :** exécuté sur la colonne `entreprise` (normalisation accents/casse). **0 entreprise retirée** — aucun recoupement entre les deux fichiers, la consigne de diversification sectorielle donnée à l'agent Sales général ayant bien fonctionné. Le fichier de Méroë reste à 30 lignes, en dessous de 40 pour cause de budget de recherche épuisé, non pour cause de dédoublonnage.

---

## 6. Actions recommandées

1. **Filtrer sur les dates avant d'appeler.** Le champ `notes` porte la date réelle quand elle est connue et `Date: NC` sinon. Plusieurs annonces sont antérieures à la fenêtre 7 jours et sont signalées comme telles.
2. **Vérifier l'effectif groupe** sur les lignes `Effectif: NC` avant démarchage — le plafond 2000 n'a pas pu être contrôlé sur la majorité des cibles.
3. **Enrichir les contacts.** 143 lignes sur 152 sont en `CONTACT_NON_SOURCE` : le rôle cible et l'entreprise sont corrects, seul le nom manque. FullEnrich ou un passage LinkedIn manuel comblera l'écart.
4. **Relancer le run** avec un budget de recherche disponible pour compléter les 48 lignes manquantes et les ~15 récurrences non vérifiées.
