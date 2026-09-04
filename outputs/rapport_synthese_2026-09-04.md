# Rapport de synthèse — Market Mapping Humanup.io — 2026-09-04

> ⚠️ **Run fortement dégradé.** Le quota de recherche web de la session (200 requêtes, partagé entre tous les sous-agents) a été épuisé en cours de run, et le proxy egress a bloqué la quasi-totalité des sites cibles (APEC, Indeed, LinkedIn, Pappers, Societe.com, WTTJ, CFNews, presse spé) en accès direct.
> **112 lignes livrées sur 200 attendues (56 %) et 8 contacts nominatifs sur 112 (7 %).**
> Conformément à la règle « intégrité > volume », aucun sous-agent n'a inventé de nom ni d'entreprise : les contacts non sourcés sont livrés avec `nom`/`prenom`/`linkedin` vides et le tag `CONTACT_NON_SOURCE`. Les fichiers restent exploitables pour FullEnrich (l'entreprise et le poste cible sont renseignés partout), mais l'enrichissement devra faire le travail de nommage.

---

## 1. Volumes par vertical

| Vertical | Destinataire | Lignes livrées / cible | Entreprises | Contacts sourcés | Taux |
|---|---|---|---|---|---|
| Finance (A+B+C) | Valentin Murcia | **20 / 40** | 10 | 0 | 0 % |
| Hospitality | Valentin Murcia | **40 / 40** ✅ | 15 | 6 | 15 % |
| Industrie | Alexis | **12 / 40** | 6 | 1 | 8 % |
| Sales SaaS | Louis | **28 / 40** | 14 | 1 | 4 % |
| Sales général | Méroë Nguimbi | **12 / 40** | 6 | 0 | 0 % |
| **TOTAL** | | **112 / 200** | **51** | **8** | **7 %** |

Détail du merge Finance : Part A (compta + CdG) 2 lignes, Part B (audit/cabinet/conso/fiscalité) 10 lignes, Part C (paie/tréso/DAF) 8 lignes.

---

## 2. Top régions / villes / secteurs

**Régions** — la consigne « privilégier les régions vs Paris/IdF » est respectée : Nouvelle-Aquitaine (Lacq, Lescar, Bordeaux), Pays de la Loire (Saint-Nazaire, Chalonnes-sur-Loire, Nantes, Laval, Le Mans), Occitanie (Canet-en-Roussillon, Montauban), Auvergne-Rhône-Alpes (Lyon), Bretagne (Côtes-d'Armor), Grand Est (Maxéville), PACA (Bendor).

**Villes les plus représentées** : Lyon, Nantes, Bordeaux, Paris (surtout sur Sales SaaS).

**Secteurs** : hôtellerie-restauration indépendante haut de gamme (le seul vertical au volume plein), SaaS B2B vertical (RH, retail CX, nucléaire, notes de frais, événementiel), industrie de souveraineté (terres rares, défense/aéro, nautisme éco-conçu), BTP/négoce de matériaux, cabinets d'expertise comptable régionaux en croissance externe.

---

## 3. Top 7 signaux business prioritaires

1. **Carester + LCM Europe / USA Rare Earth (Lacq, 64)** — création d'une « vallée des aimants » terres rares, +110 M€ investis, 80 à 92 emplois créés. Souveraineté industrielle, recrutements techniques massifs à venir. *(Industrie)*
2. **Beauvallon Collection — rachat et réouverture de la Villa Florentine 5\* Relais & Châteaux (Lyon)** — dirigeant identifié : Amaury Rostagnat. Réouverture = staffing complet d'un palace. *(Hospitality)*
3. **Numans (Lyon)** — ouverture de capital à **Andera Partners + Bpifrance** pour doubler le CA d'ici 2028, avec acquisition du cabinet bordelais Sodac. 250 salariés. Croissance externe = besoins finance + intégration. *(Finance)*
4. **Groupe Les Sources (Jérôme & Alice Tourbier)** — ouverture des Sources de Vougeot, Château de Gilly-lès-Cîteaux. Groupe familial indépendant en expansion. *(Hospitality)*
5. **Zannier Île de Bendor (PACA)** — ouverture mai 2026, **200+ postes créés**. Le plus gros volume de recrutement hospitality identifié. *(Hospitality)*
6. **Windelo (Canet-en-Roussillon, 66)** — 4 M€ levés pour doubler le site de production de catamarans éco-conçus, cible ~150 salariés. Contact sourcé : Olivier Kauffman. *(Industrie)*
7. **Groupe Daniel (Lescar, 64)** — BTP/granulats/béton familial indépendant, CA 80 M€, recrute son **Directeur Commercial membre du CODIR**. Mandat de direction, fort potentiel de fee. *(Sales)*

Autres à noter : Coraxes (22, usinage défense/aéro, extension 1200→2000 m²), Fiteco × Fleuret Associés, Amarris × Altexa, Adista (Credit Manager Groupe, ETI 1300 sal.), WizVille (seul contact SaaS nommé : Timothée de Laitre, CEO).

---

## 4. Récurrences — entreprises déjà ciblées avec actualité fraîche

Vérification sur les 192 entreprises déjà ciblées les 14 derniers jours. **18 entreprises vérifiées sur 35 sélectionnées** avant épuisement du quota de recherche ; **1 seule récurrence confirmée avec une date certaine** dans la fenêtre 28/08 – 04/09/2026 :

- **K-Line (Groupe Liebot)** — journée recrutement sur site aux Herbiers (ateliers ouverts, postes opérateur de production), mardi 1er septembre 2026. Source : Partnaire.

Les autres signaux trouvés étaient soit non datés, soit antérieurs au 28/08 : ils ont été écartés plutôt que présentés comme frais. 17 entreprises de la sélection n'ont pas pu être vérifiées faute de quota (Respire, Shipup, Simplébo, Simone Pérèle, Tekever France, Triballat Noyal, Voyageurs du Monde, Zwilling Staub France, AssessFirst, La Réserve Paris, Sicame Group, etc.).

---

## 5. Filtres appliqués

- **Anti-doublons** : 192 entreprises ciblées sur les 14 derniers jours exclues des nouvelles recherches. Aucune ne réapparaît dans les fichiers du jour.
- **Plafond effectif groupe < 2000 salariés** : appliqué. Écartés à ce titre — Cooperl, Nestlé, Michelin, Webedia/Elephant (effectif groupe non vérifiable, écarté par prudence).
- **Exclusion < 5 salariés** et **exclusion alternance / stage / apprentissage / contrat pro** : appliquées.
- **Liste noire** : Big 4, next tier (Mazars, Grant Thornton, BDO, RSM, Baker Tilly), réseaux EC (In Extenso, Fiducial, Cerfrance, Exco, Sofarec), scale-ups surmédiatisées, CAC 40 — aucune présente dans les livrables.
- **Cabinets d'intérim masquant l'employeur** : plusieurs offres Michael Page et assimilées écartées faute de client final identifiable.
- **Groupes hôteliers exclus** (Accor, Marriott, Hilton, IHG, Hyatt, Rosewood, Four Seasons, Mandarin Oriental) : aucun établissement de ces groupes dans le fichier Hospitality.

---

## 6. Dédoublonnage Sales (Louis ↔ Méroë)

**Aucune entreprise retirée.** Les 6 entreprises du fichier de Méroë (BTP, négoce de matériaux, conseil achats) n'ont aucun recouvrement avec les 14 sociétés SaaS du fichier de Louis. Le fichier de Méroë est sous la cible de 40 lignes (12 lignes) pour cause de quota de recherche, pas de dédoublonnage.

---

## 7. Réserves de qualité à connaître avant d'attaquer les fichiers

- **Hospitality** : le volume de 40 lignes est atteint, mais les 6 signaux NEWS sont réels et vérifiés tout en étant **datés de mars à mai 2026**, donc hors de la fenêtre stricte de 30 jours. À traiter comme des ouvertures à moyen terme, pas comme de l'actualité chaude.
- **Industrie** : **aucune job ad des 7 derniers jours** n'a pu être sourcée avec un employeur nommé. Les 12 lignes sont exclusivement des signaux NEWS confirmés.
- **Sales SaaS** : à l'inverse, 14 job ads vérifiés mais **0 signal news** — aucune levée ni opération PE n'a pu être vérifiée avant l'épuisement du quota. Le fichier de Louis est donc purement « job ads » aujourd'hui.
- **Finance** : 0 contact nominatif sur 20 lignes. Part A (comptabilité générale + contrôle de gestion) n'a produit qu'une seule entreprise (E.R.B., BTP familial 62 sal. à Chalonnes-sur-Loire).
- **Contacts** : 104 des 112 lignes portent le tag `CONTACT_NON_SOURCE`. Les colonnes `entreprise`, `poste`, `localisation` et `notes` sont renseignées : FullEnrich a de quoi travailler, mais le taux de résolution sera plus bas qu'un run nominal.

## 8. Action recommandée

Relancer une passe ciblée dès réinitialisation du quota de recherche web, en priorité sur **Finance Part A**, **Industrie (job ads 7 j)** et **Sales général** — les trois verticales les plus déficitaires. Le quota étant partagé entre les sous-agents parallèles, l'exécuter en séquentiel ou par lots de 2 sous-agents limiterait la contention.
