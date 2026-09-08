# Rapport de synthèse — Market Mapping Humanup.io
**Date : 2026-09-08**

---

## ⚠️ Avertissement qualité — run dégradé

Ce run a été **fortement contraint par l'infrastructure**. À lire avant d'exploiter les fichiers :

1. **Budget WebSearch de session épuisé (200/200)** en cours de mission. Les 8 agents partagent
   le même quota : il a été consommé après ~10-13 requêtes par agent. C'est la cause principale
   des volumes manquants et du très faible taux de sourcing nominatif.
2. **Proxy bloquant en WebFetch la quasi-totalité des sources utiles** : APEC, Indeed, Hellowork,
   France Travail, LinkedIn, Welcome to the Jungle, Pappers, Societe.com, Usine Nouvelle,
   Journal des Palaces, L'Hôtellerie Restauration, CFNews, Maddyness, Le Journal des Entreprises,
   annuaire-entreprises.data.gouv.fr, et les sites carrière corporate. Travail **exclusivement
   sur snippets de recherche**.
3. **Conséquence directe — le filtre « annonce publiée dans les 7 derniers jours » n'a PAS pu
   être appliqué.** La quasi-totalité des lignes portent `Date: NC`. Les annonces sont réelles et
   actives au 2026-09-08 avec URL vérifiée, mais leur fraîcheur n'est pas garantie.
   **À requalifier avant appel.**
4. **Effectifs majoritairement `NC`** : le plafond strict < 2000 salariés au niveau groupe a été
   appliqué sur toutes les entreprises vérifiables (nombreuses exclusions effectives, voir plus bas),
   mais il n'a pas pu être confirmé sur une partie du fichier.

Aucune donnée n'a été inventée. Les champs non confirmés sont marqués `NC` et les contacts non
trouvés portent le tag `CONTACT_NON_SOURCE` avec `nom`/`prenom`/`linkedin` vides.

---

## Volumes par verticale

| Verticale | Destinataire | Lignes | Cible | Entreprises | Contacts sourcés | Taux |
|---|---|---|---|---|---|---|
| Finance (A+B+C) | Valentin | 38 | 40 | 19 | 12 | 32 % |
| Hospitality | Valentin | 40 | 40 | 20 | 3 | 8 % |
| Industrie | Alexis | 26 | 40 | 13 | 1 | 4 % |
| Sales SaaS | Louis | 40 | 40 | 20 | 1 | 3 % |
| Sales général | Méroë | 14 | 40 | 7 | 8 | 57 % |
| **TOTAL** | | **158** | **200** | **79** | **25** | **16 %** |

Répartition : **114 lignes JOB / 44 lignes NEWS**.

**Volumes non atteints :**
- **Industrie : 26/40** (7 opportunités JOB manquantes) — budget de recherche épuisé.
- **Sales général (Méroë) : 14/40** — budget de recherche épuisé. Ce n'est **pas** dû au
  dédoublonnage (voir ci-dessous).
- Finance : 38/40 (Finance B a livré 12 lignes au lieu de 14, faute d'un 2ᵉ signal NEWS
  non blacklisté ; Finance C a livré 6 JOB + 0 NEWS au lieu de 4 JOB + 2 NEWS).

---

## Dédoublonnage Sales (Louis ↔ Méroë)

**Aucune entreprise retirée.** Les 7 entreprises du fichier de Méroë et les 20 du fichier de Louis
sont totalement disjointes — l'agent Sales général a bien évité le SaaS pur comme demandé.
Le fichier de Méroë est donc à 14 lignes **par manque de volume produit**, pas par dédoublonnage.

*Point de vigilance :* **Bassetti** (fichier Méroë) est une société d'ingénierie / digitalisation
industrielle — à surveiller comme doublon potentiel avec le périmètre de Louis sur les prochains runs.

---

## Anti-doublons (14 derniers jours)

**340 entreprises** déjà ciblées entre le 2026-08-25 et le 2026-09-07 ont été exclues de la
recherche. Exclusions effectivement appliquées et remplacées ce jour, notamment :
Groupe PIC / Anne-Sophie Pic, Groupe HIS, Le Pavillon de la Reine (Hospitality) ;
Nexia S&A, Compagnie Fiduciaire, Endrix, Exponens, Orcom (Finance B) ;
Savoisienne Habitat (Finance C, seul signal DAF frais du mois — perdu de ce fait) ;
MeetDeal, MasterGrid (Sales) ; iBanFirst (Finance C).

---

## Recurrences — entreprises déjà ciblées avec un signal frais (7 derniers jours)

40 des 340 entreprises ont été re-vérifiées (sélection par fréquence d'occurrence + potentiel de news).
**2 récurrences confirmées et datées :**

- **Voyageurs du Monde** (Paris) — Offre publique de retrait déposée le **01/09/2026** par la société
  Avantage à 180 €/action (86,59 % du capital déjà détenu). Recomposition capitalistique imminente :
  fenêtre d'approche dirigeants/RH très favorable.
  [Source EQS](https://www.eqs-news.com/news/fr-regulatory/societe-avantage-communique-du-1er-septembre-2026-relatif-au-depot-de-projet-doffre-publique-de-retrait-visant-les-titres-de-la-societe-voyageurs-du-monde/9233b38f-b83c-4158-bd20-451cb583b7c0_fr)
- **K-Line / Groupe Liebot** (Les Herbiers, 85) — Session de recrutement en atelier le **01/09/2026**
  avec entretiens sur place, en complément de postes d'opérateurs « rentrée septembre ».
  Besoin volumique récurrent confirmé.
  [Source Partnaire](https://www.partnaire.fr/nos-offres-d-emploi/les-herbiers-rendez-vous-recrutement-k-line-le-mardi-01-septembre-2026-08-06-76536/)

Écartés faute de datation dans la fenêtre : Mecalac (salon Nordbau, hors typologie),
Precia Molen (résultats S1 au 25/09, postérieur). ~10 noms n'ont pas pu être couverts
(Foussier, GYS, Stif, Socomore, Triballat Noyal, Sill, Eurogerm, Nexia S&A, Capeos, EUREX).

---

## Top 7 signaux business prioritaires

1. **Voyageurs du Monde** (Paris) — OPR déposée le 01/09/2026 à 180 €/action. Recomposition
   capitalistique = fenêtre d'approche dirigeants immédiate. *(Récurrence)*
2. **Brasserie Castelain** (Bénifontaine, 62 — 50 sal, 25 M€) — 6 M€ investis pour internaliser une
   ligne de canettes + extension 2 700 m², mise en service fin d'année. Besoins immédiats
   conducteurs de ligne / maintenance / qualité. *(Industrie)*
3. **Groupe Giroud** (Lyon) — investisseur hôtelier familial indépendant : acquisition d'un hôtel
   48 chambres Paris 12ᵉ + ouverture Première Classe Lyon St-Exupéry, portefeuille porté à
   26 hôtels / 1 700 chambres. Dirigeant sourcé nominativement. *(Hospitality)*
4. **Black Star Next / marque Léonard** (Béthune, 62) — reprise en juin 2026, passage de 91 à
   117 salariés fin juillet, rentabilité atteinte, 8-10 embauches d'ici fin d'année.
   Deux dirigeants sourcés. *(Finance)*
5. **Sadec Akelys** (560 collab., 28 sites, indépendant) — croissance externe en série
   (Corgeco, Dauficom, Groupe Marquant) + nouveaux associés Lille / Nancy / Strasbourg,
   recrutements simultanés de chefs de mission. *(Finance)*
6. **Tanguy Matériaux Distribution** (groupe familial breton, 1 150 sal, 300 M€) — 3 postes
   d'attaché technico-commercial ouverts simultanément sur Seiches-sur-le-Loir (49).
   DirCom + RH sourcés. *(Sales)*
7. **CLM Industrie** (Chevigny-Saint-Sauveur, 21) — atelier de 1 500 m² à 1,2 M€ triplant la
   surface, CA visé 9 M€, entrée sur le programme porte-avions PANG via TechnicAtome et
   CEA Valduc. *(Industrie)*

---

## Top régions / villes / secteurs

**Villes :** Paris (49 lignes), Lyon (12), puis une longue traîne régionale à 2 lignes —
Noyal-Pontivy (56), Plélo (22), Champsac (87), Strasbourg (67), Valence (26), Domloup (35),
La Rochelle (17). 10 lignes en localisation `NC`.

La concentration parisienne vient des verticales Hospitality et Sales SaaS. La consigne
« privilégier les régions » a bien été tenue sur l'**Industrie** (Bretagne, Hauts-de-France,
Bourgogne-Franche-Comté, Grand Est) et sur le **Sales général** (Grand Ouest 49/29,
Hauts-de-France 80, Nouvelle-Aquitaine 47/33, AURA 38/69/42, Grand Est 88).

**Sources :** Welcome to the Jungle (28), Journal des Palaces (22), Hellowork (18), Taleez (12),
Usine Nouvelle (10), CFNews (10), Teamtailor (9), Le Journal des Entreprises (8).

**Secteurs Sales général :** négoce matériaux / BTP, dispositif médical, emballage agro,
transport-logistique, ingénierie industrielle. Aucun SaaS pur.

---

## Filtres appliqués

**Plafond strict < 2000 salariés (groupe)** — exclusions effectives ce jour :
LDC, Chausson Matériaux, Amphenol, record / ASSA ABLOY, Jungheinrich, VYV 3, ACC, Bertin/CNIM,
M+ Matériaux (groupe SAMSE, 7 300 sal), Groupe ADF (3 900), Biscuit International, Groupe Rocher,
Volkswagen, XPO.

**Chaînes hôtelières exclues :** Accor, Marriott, IHG, Hyatt, Rosewood, Barrière, Dorchester,
Groupe Bertrand, ainsi que la Citadelle Vauban (exploitée par Accor).

**Liste noire respectée :** Big 4, Forvis Mazars, Baker Tilly, In Extenso, Fiducial, Cerfrance.

**Cabinets masquant le client final exclus :** Michael Page, Robert Half, Uptoo, Synergie,
Talents Business, Club Comptable, Adsearch, Nextep HR, Mistertemp' (par prudence).

**Alternance / stage :** aucune annonce retenue.

---

## Points à valider avant appel

**Industrie (Alexis)** — effectif groupe non confirmé (`EFFECTIF_NC`) sur : PolyPeptide France
(groupe PolyPeptide, à confirmer < 2000), Migen Service, Techmeta, Escao, Van Den Casteele,
Abax Industries, Celtigel, Delouis, Insitu, CLM Industrie, Tôleries Claux.
Techmeta : localisation `NC`. **Van Den Casteele et Escao : URL d'article précis non capturée**
(lien pointant sur la rubrique Usine Nouvelle) — à retrouver avant appel.

**Sales SaaS (Louis) — écart de ciblage à arbitrer.** Deux sociétés retenues dépassent le cadre
« pas de licorne, 10-500 salariés » :
- **Brevo** — LBO bis, valorisation > 1 Md€ (06/2026)
- **Sogelink** — LBO V (Keensight Capital + CVC), valorisation > 1 Md€

Elles ont été conservées dans le fichier au titre du signal PE, mais **elles sortent du profil
dark horse demandé**. À arbitrer : les retirer ou les traiter comme exception assumée.
Par ailleurs, plusieurs signaux NEWS de ce fichier sont **hors fenêtre 30 jours** (dates réelles
reportées honnêtement en notes) et 3 annonces (Onoff, Markentive, Evaneos) portent un indice
« juillet 2026 ». À requalifier.

**Finance (Valentin)** — Crowe France est une entité d'un réseau international : vérifier
l'effectif groupe avant approche. ODAS Conseil : effectif non vérifiable.

**Sales général (Méroë)** — les 8 contacts sourcés proviennent de FullEnrich
(`search_people_external`) ; les titres ont été filtrés par la requête mais **non re-vérifiés
sur LinkedIn** (bloqué par le proxy). À reconfirmer au téléphone.

---

## Recommandations pour les prochains runs

1. **Le quota WebSearch (200 requêtes/session) est le goulot d'étranglement.** Avec 8 agents en
   parallèle, chacun n'a disposé que d'une douzaine de requêtes. Deux pistes : réduire le nombre
   d'agents simultanés, ou allouer explicitement un budget de requêtes par agent (ex. 20 chacun)
   et prioriser le sourcing nominatif sur les 5 meilleures opportunités plutôt que de chercher
   à couvrir 20 opportunités superficiellement.
2. **Cibler directement les flux datés** (lhotellerie-restauration.fr, journaldespalaces.com,
   lejournaldesentreprises.com, cfnews.net) plutôt que des requêtes entreprise par entreprise —
   recommandation issue de l'agent Recurrences.
3. **Le taux de sourcing nominatif (16 %) est très en deçà de l'usuel.** Le canal FullEnrich
   (`search_people_external` via Propium), seul canal non bloqué, a donné le meilleur rendement
   du run (8/14 sur le fichier Sales de Méroë). À généraliser aux autres verticales.

---

## Fichiers livrés

| Fichier | Destinataire | Lignes |
|---|---|---|
| `outputs/finance_2026-09-08.csv` | Valentin | 38 |
| `outputs/hospitality_2026-09-08.csv` | Valentin | 40 |
| `outputs/industrie_2026-09-08.csv` | Alexis | 26 |
| `outputs/sales_saas_2026-09-08.csv` | Louis | 40 |
| `outputs/sales_2026-09-08.csv` | Méroë | 14 |
| `outputs/humanup_market_mapping_2026-09-08.xlsx` | Méroë (6 onglets) | 158 |

Format vérifié sur les 5 CSV : 11 colonnes, UTF-8 BOM, séparateur `;`, CRLF,
header conforme, aucun `;` interne, colonnes `email` et `telephone` vides partout
(enrichissement FullEnrich à venir).
