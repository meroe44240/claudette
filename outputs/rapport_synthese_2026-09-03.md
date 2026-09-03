# Rapport de Synthèse — Market Mapping Humanup.io
**Date :** 2026-09-03 | **Version routine :** v2 (5 verticales)
**Équipe :** Valentin Murcia (Finance + Hospitality) · Alexis Rivollier (Industrie) · Louis (Sales SaaS) · Méroë Nguimbi (Sales tous secteurs)

> Marie Le Ret ne fait plus partie de l'équipe : aucun envoi ne lui est destiné.

---

## 0. Note de cadrage sur la journée

La routine a tourné **deux fois aujourd'hui** : une première passe en v1 ce matin (06h55 UTC) qui a produit **et envoyé** Finance, Hospitality et Industrie, puis cette passe en v2 qui ajoute les deux verticales Sales créées par la nouvelle version du prompt.

Conséquence assumée : **Finance, Hospitality et Industrie n'ont pas été régénérées**. Les régénérer aurait envoyé à Valentin et à Alexis un second jeu de fichiers pour la même journée. Les fichiers du matin restent les livrables du jour pour ces trois verticales et sont intégrés tels quels au XLSX consolidé.

**Envois de cette passe :** Louis et Méroë uniquement. Valentin et Alexis ont déjà reçu leurs fichiers ce matin (emails partis entre 07h02 et 11h39 UTC).

---

## 1. Volumes par vertical

| Vertical | Destinataire | Lignes | Entreprises uniques | Contacts sourcés | % sourcé | JOB | NEWS |
|---|---|---|---|---|---|---|---|
| Finance | Valentin | 30 | 13 | 5 | 17 % | 22 | 8 |
| Hospitality | Valentin | 40 | 19 | 3 | 8 % | 28 | 12 |
| Industrie | Alexis | 40 | 20 | 3 | 8 % | 28 | 12 |
| Sales SaaS | Louis | 40 | 20 | 0 | 0 % | 36 | 4 |
| Sales général | Méroë | 26 | 13 | 3 | 12 % | 26 | 0 |
| **TOTAL** | — | **176** | **85** | **14** | **8 %** | **140** | **36** |

### Écarts au volume cible — mode best-effort

- **Sales général (Méroë) : 26 lignes au lieu de 40.** 13 opportunités trouvées sur 20, toutes en JOB. Aucun signal NEWS n'a passé les filtres : les pistes identifiées (MasterGrid, VD-Industry, Finimetal/Purmo, Mabéo Industries) ont chacune échoué sur un critère strict — nomination datant de plus de 30 jours, groupe parent au-dessus de 2000 salariés, ou effectif non vérifiable. Exclusion par prudence plutôt que fabrication de donnée.
- **Sales SaaS (Louis) : 40 lignes atteintes, mais répartition 18 JOB / 2 NEWS** au lieu de 14/6. Le budget de recherche s'est épuisé pendant la phase NEWS ; quatre opportunités JOB supplémentaires ont compensé pour tenir le volume. Un troisième signal NEWS (Skello, LBO Bridgepoint) a été écarté faute d'URL source directement vérifiable.
- **Contacts nominatifs : 14 sur 176 lignes (8 %).** Le plafond de requêtes de recherche a été atteint sur les deux agents Sales avant la phase de sourçage LinkedIn/Pappers. Les 162 lignes restantes portent le tag `CONTACT_NON_SOURCE` avec `nom`, `prenom` et `linkedin` vides — à enrichir via FullEnrich. Aucun nom n'a été inventé.
- **Dates de publication majoritairement `NC`.** APEC, Indeed, Hellowork, LinkedIn, WTTJ, Pappers et Societe.com sont bloqués par le proxy réseau. Le travail s'est fait sur les extraits de recherche ; la fenêtre stricte des 7 jours n'a pas pu être confirmée annonce par annonce côté Sales.

---

## 2. Top régions / villes / secteurs

### Sales SaaS (Louis)
20 éditeurs SaaS / tech B2B français de 10 à 500 salariés, hors licornes et hors Next40/FT120 :
Mayday, Inpulse, Sinay, SkyVisor, Jint (ex-Mozzaik365), Edflex, Shipup, Riot, Talkspirit, Modjo, Najar, AssessFirst, Padam Mobility, KatchMe, Locomotive, Novalend Tech Solutions, Windoo, Zei, Instant System, Arche MC2.
Postes couverts : Head of Sales, Account Executive, BDR/SDR, Customer Success Manager, Partnerships Manager.

### Sales général (Méroë)
Volontairement hors SaaS pour éviter le recouvrement avec Louis :
- **Transport / logistique (2)** : Transports Caillot (51), SAS Transports Van de Walle
- **Industrie / équipement (3)** : SAIREM, ZEP Industries, Krampouz
- **Distribution / négoce (3)** : Foussier (72), Warmpac France, Groupe Derval Rogé
- **Agroalimentaire / vin (2)** : Champagne Henriot, M. Chapoutier
- **Santé / medtech (1)** : LSO Medical
- **BTP (2)** : Heliowatt Construction, Design Parquet (35)

Régions : Grand Est / Hauts-de-France (4), Occitanie / PACA (3), Bretagne (2), Auvergne-Rhône-Alpes (1), Centre-Val de Loire (1), Pays de la Loire (1), Nord (1).

### Finance, Hospitality, Industrie
Voir le détail dans le XLSX consolidé. Dominantes du matin : Bretagne et Pays de la Loire côté Industrie, Paris intra-muros et 5* de province côté Hospitality, cabinets d'expertise comptable indépendants en consolidation côté Finance.

---

## 3. Top 7 signaux business prioritaires

1. **Arche MC2** (Aix-en-Provence, 13) — *Sales SaaS* — Continuation vehicle de **125 M€** closé (Ardian, unitranche) porté par **Montefiore Investment & Activa** pour financer une stratégie de build-up. Leader français du logiciel SaaS médico-social, 250-540 sal. Closing 30/07/2026 — légèrement hors fenêtre des 30 jours, conservé pour son poids.
2. **Instant System** (Grenoble, 38) — *Sales SaaS* — **Meanings Capital Partners** prend une participation majoritaire aux côtés de **Bpifrance**. Éditeur SaaS MaaS pour opérateurs de transport public, 120+ sal. Annoncé le 26/08/2026.
3. **Groupe Archipel / Lamy Experts** — *Finance* — Levée 65 M€ + 5 acquisitions au S1 2026, cabinet EC indépendant de 450 sal. **Récurrence confirmée aujourd'hui** : dépassement des 30 M€ de CA consolidé et deux nouvelles acquisitions signées, adossé à Alpera Partners (enveloppe 50 M€).
4. **Foussier** (Allonnes, 72) — *Sales* — Distributeur indépendant de quincaillerie et fournitures techniques, 1000-1999 sal, 85 agences actives, recrute des technico-commerciaux sur plusieurs régions. Cible dark horse idéale.
5. **Les Cimes Bleues / La French Collection** (La Baule, 44) — *Hospitality* — Ouverture juillet 2026, 101 chambres, 30 M€ d'investissement, équipe opérationnelle complète à constituer.
6. **Conserverie Chancerelle** (Douarnenez, 29) — *Finance* — Double offre CDI contrôle de gestion (industriel + groupe), groupe familial breton 1900 sal, CA 182 M€.
7. **Design Parquet** (Torcé, 35) — *Sales* — Fabricant familial breton de parquets, top 3 France, +15 % de croissance sur 3 ans, nouvel investissement industriel, recrute un responsable des ventes Sud-Ouest. Dirigeant sourcé nominativement (Yves Panaget).

---

## 4. Récurrences — entreprises déjà ciblées avec news fraîche

Scan des 14 derniers jours : **159 entreprises** déjà ciblées, exclues de la nouvelle recherche. Parmi elles, 8 présentent un signal frais qui justifie une relance.

| Entreprise | Ciblée le | Signal |
|---|---|---|
| **Voyageurs du Monde** | 03/09 | OPR annoncée le **01/09/2026** par AVANTAGE à 180 €/action et 182,52 €/OC. Retrait de la Bourse de Paris pour se développer à l'international. Réorganisation actionnariale = besoins de structuration. |
| **Groupe Archipel** | 03/09 | Dépasse 30 M€ de CA consolidé, deux nouvelles acquisitions signées, adossé à Alpera Partners via une enveloppe de 50 M€. Build-up actif. |
| **K-Line (Groupe Liébot)** | 03/09 | Usine de Lliçà de Vall (Catalogne), 20 000 m², investissement > 28 M€, démarrage S2 2026 : production triplée à 1 500 fenêtres/semaine, effectif doublé. Usine des Herbiers (85) : 32 M€. |
| **Nexia S&A** | 02/09 | Croissance de 9,6 %, lancement du cycle stratégique 2030, intégration d'Atriom (consolidation et évaluation). |
| **PKF Arsilon** | 02/09 | Nomination de 7 nouveaux associés, dont la direction du département transaction services. |
| **Endrix** | 03/09 | Expansion internationale annoncée vers la Suisse, l'Italie et l'Espagne. |
| **Relais de Chambord** | 03/09 | 30 postes à pourvoir (TourMag). Date de publication `NC`. |
| **Triballat Noyal / Olga** | 03/09 | 60 recrutements en cours (APECITA). 1 350 sal, CA 335 M€. Date de publication `NC`. |

Les deux dernières lignes portent une date de publication non confirmée : les articles ne sont pas datés de façon exploitable dans les extraits de recherche. À vérifier avant relance.

---

## 5. Filtres appliqués

- **Plafond effectif groupe < 2000 salariés (strict)** — vérifié au niveau du groupe, pas du site. Toutes les entreprises retenues sont confirmées sous le seuil.
- **Plancher 5 salariés** — exclusion par prudence si non vérifiable.
- **Exclusion alternance / stage / apprentissage / contrat pro** — appliquée sur titre et description.
- **Liste noire** — Big 4, next tier, réseaux EC, scale-ups surmédiatisées, CAC 40, chaînes hôtelières (Accor, Marriott, Hilton, IHG, Hyatt, Rosewood, Four Seasons, Mandarin Oriental), cabinets d'intérim masquant le client final. Aucune occurrence dans les fichiers du jour.
- **Anti-doublons 14 jours** — 159 entreprises exclues de la recherche.

---

## 6. Dédoublonnage Sales Louis ↔ Méroë

Croisement de `sales_2026-09-03.csv` contre `sales_saas_2026-09-03.csv` sur la colonne `entreprise` (normalisation casse et accents) :

**Aucune entreprise retirée.** Les deux périmètres ne se recoupent pas — l'agent Sales général a été orienté hors SaaS pur (industrie, distribution, négoce, transport, BTP, santé, agro), ce qui a évité le recouvrement en amont. Le fichier de Méroë reste à 26 lignes, sous la cible de 40, pour la raison de volume exposée en section 1 et non à cause du dédoublonnage.

---

## 7. Actions prioritaires

1. **Enrichir les 162 contacts non sourcés via FullEnrich** — c'est le principal frein à l'activation des fichiers du jour.
2. **Louis** — attaquer Arche MC2 et Instant System : deux opérations PE fraîches avec des besoins commerciaux structurants.
3. **Méroë** — Foussier (85 agences, recrutements technico-commerciaux multi-régions) est la meilleure porte d'entrée du fichier Sales.
4. **Relancer les 8 récurrences**, en priorité Voyageurs du Monde (OPR du 01/09) et Groupe Archipel (build-up actif).
5. **Prévoir une session dédiée au sourçage nominatif** avec un budget de recherche propre : le plafond de requêtes est aujourd'hui atteint sur la phase de découverte des opportunités, avant la phase d'identification des contacts.

---

## 8. Fichiers du jour

| Fichier | Contenu |
|---|---|
| `outputs/finance_2026-09-03.csv` | 30 lignes — Valentin (généré ce matin) |
| `outputs/hospitality_2026-09-03.csv` | 40 lignes — Valentin (généré ce matin) |
| `outputs/industrie_2026-09-03.csv` | 40 lignes — Alexis (généré ce matin) |
| `outputs/sales_saas_2026-09-03.csv` | 40 lignes — Louis |
| `outputs/sales_2026-09-03.csv` | 26 lignes — Méroë |
| `outputs/humanup_market_mapping_2026-09-03.xlsx` | Consolidé, 6 onglets |
| `outputs/rapport_synthese_2026-09-03.md` | Ce rapport |
