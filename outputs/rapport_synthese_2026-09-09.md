# Rapport de synthèse — Market Mapping Humanup.io — 2026-09-09

> ⚠️ **Run dégradé.** Le quota WebSearch de la session (200 appels, partagé entre les 8 sous-agents) a été
> épuisé en cours de run, et le proxy d'egress bloque en WebFetch la quasi-totalité des jobboards et de la
> presse économique française. Conséquences : volume partiellement atteint sur 3 verticales sur 5 et
> **taux de sourcing nominatif de 4 %** (7 contacts nommés sur 170). Aucune donnée n'a été inventée :
> chaque ligne renvoie à une URL réelle, et tout ce qui n'a pas pu être vérifié est laissé en `NC`.
> Voir la section « Limites du run » en fin de document.

## 1. Volumes par verticale

| Verticale | Destinataire | Lignes | Entreprises | Contacts sourcés | Non sourcés | JOB | NEWS | Cible |
|---|---|---|---|---|---|---|---|---|
| Finance / Comptabilité | Valentin | 40 | 20 | 4 | 36 | 30 | 10 | 40 ✅ |
| Hospitality / Restauration | Valentin | 38 | 19 | 1 | 37 | 28 | 10 | 40 ⚠️ |
| Industrie | Alexis | 22 | 11 | 1 | 21 | 8 | 14 | 40 ❌ |
| Sales SaaS & portefeuille PE | Louis | 40 | 20 | 0 | 40 | 28 | 12 | 40 ✅ |
| Sales général | Méroë | 30 | 15 | 1 | 29 | 28 | 2 | 40 ⚠️ |
| **TOTAL** | | **170** | **85** | **7** | **163** | **122** | **48** | **200** |

**Taux de sourcing nominatif : 4 %** (7 / 170). C'est le point noir du run — voir limites.
Les 163 lignes `CONTACT_NON_SOURCE` restent exploitables : entreprise, poste cible, localisation et
contexte sont renseignés, l'enrichissement FullEnrich peut prendre le relais sur le nom.

## 2. Top régions / villes / secteurs

**Départements les plus représentés :** Paris 75 (49 lignes), Rhône 69 (12), Nord 59 (8), Loire-Atlantique 44 (6),
Isère 38 (6), Ille-et-Vilaine 35 (6), Côtes-d'Armor 22 (4), Finistère 29 (4), Moselle 57 (4), Bas-Rhin 67 (4),
Hérault 34 (4). 6 lignes en `NC`.

**Villes :** Paris (49), Lyon (10), Nantes (4), Plérin (2), Normanville (2), Lille (2), Orvault (2),
Villeneuve-d'Ascq (2), Quéven (2), Saint-Renan (2), Clermont-Ferrand (2).

**Lecture :** la concentration parisienne (29 % des lignes) vient des verticales Sales SaaS et Finance.
La consigne « privilégier les régions » a bien tenu sur l'Industrie (Bretagne, Hauts-de-France, ARA,
Grand Est) et sur le Sales général (Sarthe, Gironde, Isère).

**Secteurs porteurs du jour :** consolidation des cabinets d'expertise comptable (2 opérations en 8 jours),
agroalimentaire breton, industrie manufacturière familiale en modernisation d'outil, hôtellerie
indépendante en cours de rachat, éditeurs SaaS B2B adossés à des fonds.

## 3. Top 7 signaux business prioritaires

1. **Cogedis** (Saint-Renan, 29) — Fusion avec l'AGC Icoopa effective au 01/09/2026 : groupe indépendant de
   110 M€ de CA, 1 200 collaborateurs, 100 agences. Intégration post-fusion = besoins comptables massifs.
   → [Le Journal des Entreprises](https://www.lejournaldesentreprises.com/article/cogedis-et-icoopa-fusionnent-pour-former-un-groupe-de-110-millions-deuros-de-chiffre-daffaires-2147363)
2. **Inelys** (Lyon, 69) — Rapprochement avec Avizeo annoncé le 01/09/2026, 380 collaborateurs / 42 M€,
   4e opération de croissance externe en 2026, adossé à Crédit Mutuel Equity.
   → [Lyon Entreprises](https://www.lyon-entreprises.com/actualites/article/inelys-se-rapproche-davizeo-et-atteint-42-me-de-chiffre-daffaires)
3. **Groupe Le Graët** (Plélo, 22) — 7,5 M€ de modernisation de l'outil de production Celtigel + extension,
   800 salariés, recrutements annoncés. Cible industrielle familiale idéale.
   → [Le Journal des Entreprises](https://www.lejournaldesentreprises.com/article/nous-investissons-pour-rester-un-partenaire-privilegie-des-enseignes-de-la-grande-distribution-2146857)
4. **Malerba** (Thizy-les-Bourgs, 69) — 37 M€ d'investissement dont 20 M€ de modernisation de 3 usines,
   600+ salariés, groupe familial indépendant.
   → [Le Journal des Entreprises](https://www.lejournaldesentreprises.com/article/lindustriel-malerba-engage-37-millions-deuros-dinvestissement-2126097)
5. **Kestra** (Paris, 75) — Levée de 21,7 M€ menée par Alven, ISAI, Axeleo Capital et RTP Global.
   Éditeur d'orchestration de données, structuration commerciale à venir.
   → [Annuaire Startups](https://www.annuaire-startups.pro/liste-des-levees-de-fonds-realisees-par-des-startups-francaises-en-mai-2026/)
6. **YOU Famille Hôtelière** (Chambéry, 73) — Rachat murs + fonds de l'Hôtel Le 5 et structuration d'un
   réseau d'hôtels urbains indépendants. Seul contact hospitality nominativement sourcé du run (Pierre Esnée).
   → [La Tribune de l'Hôtellerie](https://latribunedelhotellerie.com/you-famille-hoteliere-acquisition-hotel-le-5-chambery-2026/)
7. **ADEZIF** (Lille, 59) — Rachat de STRATOS annoncé le 08/09/2026 (signal de la veille), intégration
   comptable d'une filiale à prévoir.
   → [Fusacq](https://www.fusacq.com/buzz/fr)

**Mentions honorables :** Baudelet Environnement (Blaringhem, 59 — 11,5 M€, nouvelle ligne CSR, capacité ×3) ;
Groupe WATT&Co (nomination de Julien Dugenétay comme DAF groupe) ; Sahar (Paris — entrée de Montefiore
Investment en minoritaire significatif) ; Nexpublica (build-up, acquisition de Wikit) ;
Helmi Capital / famille Taittinger (acquisition Hôtel Rendez-Vous Batignolles avec 123 IM, 7 M€) ;
Groupe de l'Hôtellerie (3e acquisition avec Tikehau Capital).

## 4. Recurrences

Entreprises déjà ciblées ces 14 derniers jours qui montrent un signal frais (fenêtre 2026-09-02 → 2026-09-09) :

- **Amarris (Amarris Expertise Comptable)** (Nantes, 44) — *finance* — Offres actives datées du 03/09/2026 :
  le cabinet de Saint-Herblain recrute plusieurs assistants comptables spécialisés location meublée pour
  renforcer l'équipe sur la période fiscale, en plus d'un collaborateur comptable confirmé en CDI.
  → [source](https://fr.indeed.com/q-amarris-emplois.html?vjk=ed77df3a42027da2)
  **Action : Amarris recrute pour la 2e fois en 10 jours — relance prioritaire par Valentin.**

**Couverture de la détection de récurrences : 6 entreprises testées sur les 148 prévues** (quota WebSearch
épuisé). Écartées faute de date confirmée dans la fenêtre : Fiteco (recrutement réel mais date imprécise),
Adista, Alixio Group, I-TRACING, Aura Aero.

À retester en priorité au prochain run : Lily of the Valley, Zannier Hotels, Maison Albar, Esprit de France,
La Tour d'Argent, Groupe Les Sources, Carester, Agronutris, Silvadec, Jean Hénaff, Sill Entreprises,
Guyader Gastronomie, Mermet, EPSA, GYS, Europe Technologies, Partedis, Rothelec, Groupe Péna, Hublo,
Sociabble, Generix Group, Gojob, Dashdoc, Supervizor, Beamy, Semji.

## 5. Filtres appliqués

- **Anti-doublons 14 jours :** 340 entreprises déjà ciblées entre le 2026-08-26 et le 2026-09-07 ont été
  exclues de la recherche. Aucune collision constatée dans les 5 fichiers livrés.
- **Plafond effectif groupe < 2 000 salariés :** appliqué. Exclusions notables du jour — Vinci/Uxello,
  SIG/Larivière, Guillin/Dynaplast, Veolia, Cegedim, Kiloutou, Darty, Mars, DEXIS, Limagrain/Jacquet Brossard,
  Mondelez, Eureden/d'aucy, Emeis, Bouygues Construction.
- **Liste noire :** Big 4, next tier (Mazars/Forvis, Grant Thornton, BDO, RSM, Baker Tilly), réseaux EC
  (In Extenso, Fiducial, Cerfrance, Exco, Sofarec), scale-ups surmédiatisées, CAC 40, et tous les cabinets
  d'intérim masquant le client final — appliquée sur les 5 verticales.
- **Chaînes hôtelières :** Accor, Marriott, Hilton, IHG, Hyatt, Rosewood, Four Seasons, Mandarin Oriental
  (et leurs marques) exclues, ainsi que Barrière et LVMH Hotel Management.
- **Alternance / stage / apprentissage :** aucune annonce de ce type retenue.
- **< 5 salariés :** exclusion par prudence quand la taille n'était pas vérifiable.

## 6. Dédoublonnage Sales (Louis ↔ Méroë)

**0 entreprise retirée du fichier de Méroë.** Les 20 entreprises de Louis (SaaS / portefeuille PE) et les
15 de Méroë (industrie, négoce, distribution, BTP, services B2B) ne se recoupent pas — la consigne donnée à
l'agent Sales général d'éviter le périmètre SaaS pur a bien fonctionné.

⚠️ Le fichier de Méroë est livré à **30 lignes au lieu de 40** (15 opportunités sur 20), non pas à cause du
dédoublonnage mais du quota WebSearch : 14 opportunités JOB et 1 seule NEWS ont pu être documentées.

## 7. Points à valider avant approche

- **DocOne** (fichier Finance) — co-entreprise Diffusion Plus / Numen / BPCE : effectif consolidé inconnu,
  risque réel de dépassement du seuil groupe 2 000 salariés. **À vérifier avant tout contact.**
- **Adecia** et **Soregor** (Finance) — effectifs non confirmés, laissés en `NC`.
- **Groupe Vert** (Plérin, 22) — 1 800 salariés annoncés : sous le plafond mais proche, à surveiller.
- **Groupe Spartes** (Finance) — annonce datée du 15/07/2026, hors fenêtre 7 jours, conservée en best-effort.
- **Groupe WATT&Co** (Finance) — nomination DAF datée de juillet 2026, légèrement hors fenêtre 30 jours.
- **Signaux Sales SaaS** — les news retenues sont datées de mai-juin 2026 ou `NC`, donc hors fenêtre
  30 jours stricte. À re-dater avant de les présenter comme des signaux chauds.

## 8. Limites du run

1. **Quota WebSearch épuisé (200/200).** Le budget est partagé entre les 8 sous-agents lancés en parallèle ;
   il a été consommé après environ 14-15 requêtes par agent, c'est-à-dire pendant la phase de collecte
   d'opportunités, avant la phase de sourcing nominatif. C'est la cause directe des 4 % de sourcing et des
   3 volumes incomplets. **Piste pour les prochains runs : réduire le nombre d'agents parallèles ou
   séquencer collecte puis sourcing, pour ne pas dépenser tout le quota sur la collecte.**
2. **Proxy d'egress.** WebFetch est bloqué (403 sur CONNECT) sur APEC, Indeed, HelloWork, LinkedIn, Pappers,
   Societe.com, Welcome to the Jungle, France Travail, L'Usine Nouvelle, Le Journal des Entreprises, LSA,
   Journal des Palaces, L'Hôtellerie Restauration, Hospitality ON, HOSCO, Compta Online, CFNews, Maddyness.
   Tout le travail a reposé sur les snippets WebSearch.
3. **Fraîcheur des annonces non vérifiable.** Faute d'accès aux pages d'offres, les dates de publication sont
   majoritairement en `NC`. La fenêtre « 7 derniers jours » a été approchée par l'ordre des identifiants
   d'offres (proxy de fraîcheur), sans garantie stricte. Les annonces datées hors fenêtre sont signalées
   individuellement dans la colonne `notes`.
4. **Effectifs, CA et salaires** majoritairement en `NC` : Pappers et Societe.com étant inaccessibles, la
   règle anti-invention a été appliquée strictement plutôt que d'estimer.

## 9. Fichiers livrés

| Fichier | Destinataire | Lignes |
|---|---|---|
| `outputs/finance_2026-09-09.csv` | Valentin Murcia | 40 |
| `outputs/hospitality_2026-09-09.csv` | Valentin Murcia | 38 |
| `outputs/industrie_2026-09-09.csv` | Alexis | 22 |
| `outputs/sales_saas_2026-09-09.csv` | Louis | 40 |
| `outputs/sales_2026-09-09.csv` | Méroë Nguimbi | 30 |
| `outputs/humanup_market_mapping_2026-09-09.xlsx` | Méroë Nguimbi (consolidé, 6 onglets) | — |
| `outputs/rapport_synthese_2026-09-09.md` | Méroë Nguimbi | — |

Fichiers de travail conservés : `_fin_a_2026-09-09.csv`, `_fin_b_2026-09-09.csv`, `_fin_c_2026-09-09.csv`.
