# Rapport de synthese — Market Mapping Humanup.io — 2026-09-16

## ⚠️ Avertissement — run degrade par des blocages d'infrastructure

Ce run n'a **pas** atteint ses volumes cibles. Deux blocages cumules, independants de la methode de recherche :

1. **Quota WebSearch de session epuise (200/200 appels)**, partage entre les 8 sous-agents. Les agents lances en parallele ont consomme le quota commun ; les derniers n'ont dispose que de ~10 requetes chacun avant refus systematique.
2. **Politique d'egress du proxy** : tous les domaines metier sont refuses en 403 sur CONNECT (job boards, Pappers, Societe.com, presse economique et sectorielle). Aucune annonce ni fiche entreprise n'a pu etre ouverte directement — le travail s'est fait uniquement sur les snippets WebSearch.

**Consequence** : volumes tres inferieurs a la cible sur plusieurs verticales, sourcing nominatif tres partiel, et de nombreuses dates de publication non confirmables. **Aucune donnee n'a ete inventee** : les champs non verifies sont en `NC` et les contacts non trouves portent le tag `CONTACT_NON_SOURCE`.

**Action requise (Meroe)** : relever `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` pour cette tache planifiee et demander l'ouverture des domaines presse/emploi dans la politique reseau de l'environnement. Sans cela, les prochains runs resteront degrades a l'identique.

## Volumes par verticale

| Verticale | Fichier | Lignes | Cible | Entreprises | Contacts sources | % source |
|---|---|---:|---:|---:|---:|---:|
| Finance (Valentin) ⚠️ | `finance_2026-09-16.csv` | 38 | 40 | 19 | 9 | 24% |
| Hospitality (Valentin) ⚠️ | `hospitality_2026-09-16.csv` | 20 | 40 | 10 | 0 | 0% |
| Industrie (Alexis) ⚠️ | `industrie_2026-09-16.csv` | 22 | 40 | 11 | 1 | 5% |
| Sales SaaS (Louis) ⚠️ | `sales_saas_2026-09-16.csv` | 6 | 40 | 3 | 1 | 17% |
| Sales general (Meroe) ⚠️ | `sales_2026-09-16.csv` | 6 | 40 | 3 | 0 | 0% |
| **TOTAL** | | **92** | **200** | **46** | **11** | **12%** |

## Top villes

- Paris (75) — 18 ligne(s)
- Lyon (69) — 6 ligne(s)
- Villefranche-sur-Saone (69) — 2 ligne(s)
- Saran (45) — 2 ligne(s)
- Nantes (44) — 2 ligne(s)
- Toulouse (31) — 2 ligne(s)
- La Plaine Saint-Denis (93) — 2 ligne(s)
- Levallois-Perret (92) — 2 ligne(s)
- Portet-sur-Garonne (31) — 2 ligne(s)
- Issy-les-Moulineaux (92) — 2 ligne(s)
- Colmar (68) — 2 ligne(s)
- Carros (06) — 2 ligne(s)

## Sources utilisees

- Journal des Palaces — 12 ligne(s)
- Taleez — 10 ligne(s)
- LinkedIn Jobs — 10 ligne(s)
- Teamtailor — 8 ligne(s)
- CFNEWS — 8 ligne(s)
- L'Usine Nouvelle — 8 ligne(s)
- L'Hotellerie Restauration — 6 ligne(s)
- Welcome to the Jungle — 4 ligne(s)
- Direction generale des Entreprises — 4 ligne(s)
- HelloWork — 4 ligne(s)
- Meteojob — 2 ligne(s)
- Le Journal des Entreprises — 2 ligne(s)

## Top 7 signaux business prioritaires

1. **Finasens** (Marseille, 13) — *Finance* — OBO/LBO primaire boucle le 02/09 avec UI Investissement (process Cambon Partners). 75+ DAF et controleurs salaries sur 6 metropoles, strategie de croissance externe annoncee → besoin structurel et recurrent de profils DAF/RAF. Contacts decideurs sourcés nominativement.
2. **Ed.ai** (Lyon, 69) — *Sales SaaS* — 5 M€ leves le 10/09 (lead Bpifrance Digital Venture, avec La Poste Ventures/XAnge, Ring Capital, 50 Partners) avec **annonce explicite de doublement des effectifs** et ouverture US/Europe. Le signal de recrutement commercial le plus actionnable du jour.
3. **CBA Informatique Liberale** (Avignon, 84) — *Sales SaaS* — build-up annonce le 14/09 : rachat de Sil-Lab Innovations, sous participation minoritaire Vivalto Partners + Amundi PE. 225 salaries, editeur sante regional PE-backed, hors radar mediatique — profil de cible ideal.
4. **Brasserie Castelain** (Benifontaine, 62) — *Industrie* — 6 M€ investis (2,5 M€ batiment + 3,5 M€ machines), extension de 2 700 m² et internalisation de la ligne de canettes, mise en service fin 2026. Brasserie familiale independante, centenaire le 12/09/2026.
5. **Escao** (Lusigny-sur-Barse, 10) — *Industrie* — 5 M€ pour deux nouveaux ateliers (ligne de vernissage automatisee de 35 m + atelier structure metallique), **4 embauches confirmees**, internalisation complete de la chaine. 3e fabricant francais d'escaliers.
6. **Groupe Cofime** (Colmar, 68) — *Finance* — prise de 52% du capital du cabinet rhodanien Ceralp (Villefranche-sur-Saone), creant un ensemble independant multi-sites. Integration post-acquisition = besoins collaborateurs comptables et chefs de mission.
7. **Machefert Group / Les Hotels de Paris** (Paris, 75) — *Hospitality* — groupe hotelier parisien independant mis en vente avec plusieurs candidats repreneurs. Une cession de ce type entraine une rotation importante des equipes de direction et d'exploitation.

## Recurrences — entreprises deja ciblees avec un signal frais (7 derniers jours)

# Récurrences — signaux frais sur entreprises déjà ciblées

Date d'analyse : 2026-09-16 — fenêtre retenue : **2026-09-09 → 2026-09-16**
Entreprises testées : 40 (sélection ETI / groupes industriels / hôtellerie / éditeurs SaaS dans le fichier d'exclusion de 442 noms)
Récurrences retenues : 4

## Signaux dans la fenêtre 7 jours

- **VALOREM** (Bègles, 33) — PPA longue durée signé avec Google pour financer de nouveaux parcs éoliens terrestres en Finlande, puis interview du DG Corentin Sivy sur la préparation de l'après-2027 — 2026-09-09 et 2026-09-11 — https://www.greenunivers.com/2026/09/comment-valorem-se-prepare-a-2027-et-au-dela-432760/
- **Eolane** (Angers, 49) — création d'un centre de compétence R&D et d'une nouvelle division produits « Smart Solutions » (IoT), confiée à Frédéric Hannoyer : structuration d'équipe en cours — 2026-09-11 — https://vipress.net/eolane-cree-un-centre-de-competence-rd-et-une-division-smart-solutions/
- **Tekever France** (Toulouse / Cahors-Lalbenque, 46) — premier vol de démonstration du drone AR3 produit localement, pendant les Drone Days d'Aerospace Valley, en amont de l'inauguration d'usine prévue avant fin 2026 (plan : 200 emplois qualifiés) — 2026-09-09/10 — https://www.aerobuzz.fr/industrie/le-premier-drone-tekever-ar3-made-in-france-dans-le-ciel-de-cahors-lalbenque/
- **Voyageurs du Monde** (Paris, 75) — couverture soutenue de l'offre publique de retrait à 180 €/action et du projet de sortie de Bourse porté par le concert majoritaire (86,6 % du capital), pour accélérer le développement international — 2026-09-13 et 2026-09-15 (opération déposée le 2026-09-01) — https://kohenavocats.fr/2026/09/15/voyageurs-monde-avantage-opr-sortie-bourse-2026/

## Hors fenêtre mais très récent (J-8 à J-13) — à garder sous le coude

Signaux réels et datés, mais antérieurs au 2026-09-09. Non comptés dans les récurrences.

- **Okko Hotels** (Paris) — dévoilement du 5e hôtel parisien, OKKO Paris Rosa Parks (Îlot Fertile, 202 rue d'Aubervilliers, Paris 19e), avec un 2e restaurant Noccio — 2026-09-08 — https://www.tendancehotellerie.fr/articles-breves/communique-de-presse/19952-article/okko-hotels-devoile-son-nouvel-hotel-a-paris-rosa-parks
- **Cem'In'Eu** (Portes-lès-Valence, 26) — visite du DG de la World Cement Association sur le site, autour de la décarbonation et de la révision de l'EU ETS — 2026-09-07 — https://industrylink.eu/cemineu-and-the-world-cement-association-reaffirm-their-shared-ambition-to-decarbonise-the-cement-industry/
- **EPSA** (Lyon) — finalisation de l'acquisition d'Energiency (Rennes), renforcement de la verticale Énergie — 2026-09-04 — https://www.bretagne-economique.com/actualites/energiency-35-repris-par-le-groupe-epsa/
- **Groupe Sud Ouest** (Bordeaux, 33) — entrée en négociations exclusives pour un rachat par le groupe belge Rossel ; ensemble à plus de 400 M€ de CA, 700 salariés — 2026-09-03 — https://www.cbnews.fr/medias/groupe-sud-ouest-negocie-son-rachat-groupe-rossel
- **Cailabs** (Rennes, 35) — première pierre de « Factory 27 », usine de 10 000 m² ; première vague de recrutements sur les fonctions d'encadrement site / méthodes / supply chain / qualité, puis ~50 postes opérationnels — 2026-09-03 — https://ici.rennes.fr/actualites/2026-09-03-cailabs-tutoie-les-etoiles/
- **Carester** (Lyon / Lacq, 64) — accord d'offtake ferme avec Lindian Resources (70 % du concentré de terres rares lourdes de Kangankunde) ; usine Caremag en service fin 2026 — 2026-09-03 — https://www.linfodurable.fr/terres-rares-carester-lance-la-construction-dune-usine-ambitieuse-lacq-49926

## Testées sans signal frais vérifiable

Alstef Group, Aura Aero, Generix Group, Mecalac, I-Tracing, Hublo, Gojob, Fontenille Collection, MagREEsource, Lauak, Bouyer Leroux, Sicame Group, Precia Molen (résultats S1 annoncés pour le 2026-09-25), Evaneos, Sociabble, Ekimetrics, Dashdoc, Mooncard, Pellenc ST, Triballat Noyal, Jean Hénaff, Sill Entreprises, GYS, Less Common Metals / USA Rare Earth, Foncière Inea (refinancement non daté précisément), Alixio Group, Adista, Agronutris, Padam Mobility, Audencia.

> Note : le budget de recherches web de la session a été atteint (200/200) après 40 entreprises testées. Les candidats non traités et prioritaires pour une prochaine passe : MasterGrid, Omerin, Europe Technologies, Partedis, Accès Industrie, Rector Lesage, Silvadec, Krampouz, Zannier Hotels, La Tour d'Argent, HelloAsso, Supervizor, Orus, Modjo, mylight150.

## Dedoublonnage Sales — entreprises retirees du fichier de Meroe (presentes chez Louis)

_Aucune entreprise retiree : aucun recouvrement entre les deux fichiers Sales._

> ⚠️ Le fichier Sales de Meroe compte **6 lignes**, sous la cible de 40. Livre en l'etat (mode best-effort).

## Filtres appliques

- Anti-doublons sur 14 jours glissants — **442 entreprises** deja ciblees exclues de la recherche.
- Plafond effectif **groupe** < 2000 salaries (strict, pas l'effectif du site).
- Exclusion des structures < 5 salaries (exclusion par prudence si non verifiable).
- Exclusion de toute annonce alternance / apprentissage / contrat pro / stage.
- Liste noire appliquee : Big 4, next tier, reseaux d'expertise comptable, scale-ups surmediatisees, CAC 40, cabinets d'interim masquant le client final.
- Groupes hoteliers Accor / Marriott / Hilton / IHG / Hyatt / Rosewood / Four Seasons / Mandarin Oriental exclus sur la verticale Hospitality.

## Fichiers livres

- `outputs/finance_2026-09-16.csv` — Finance (Valentin)
- `outputs/hospitality_2026-09-16.csv` — Hospitality (Valentin)
- `outputs/industrie_2026-09-16.csv` — Industrie (Alexis)
- `outputs/sales_saas_2026-09-16.csv` — Sales SaaS (Louis)
- `outputs/sales_2026-09-16.csv` — Sales general (Meroe)
- `outputs/humanup_market_mapping_2026-09-16.xlsx` — consolide 6 onglets
- `outputs/rapport_synthese_2026-09-16.md` — ce rapport
