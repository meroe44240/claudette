# Rapport de synthèse — Market mapping Humanup.io — 2026-09-30

## Volumes par vertical (contacts sourcés / total lignes)

| Vertical | Destinataire | Lignes | Contacts sourcés | Entreprises uniques | JOB | NEWS |
|---|---|---|---|---|---|---|
| Finance / Comptabilité | Valentin Murcia | 40 | 5 | 20 | 28 | 12 |
| Hospitality / Restauration | Valentin Murcia | 40 | 2 | 20 | 28 | 12 |
| Industrie | Alexis | 40 | 2 | 20 | 28 | 12 |
| Sales SaaS & portefeuilles de fonds | Louis | 28 | 2 | 14 | 18 | 10 |
| Sales général | Méroë Nguimbi | 40 | 8 | 20 | 34 | 6 |
| **TOTAL** | | **188** | **19** | **94** | **136** | **52** |

Cible théorique : 200 lignes (5 × 40). Livré : 188 lignes, soit 94 % du volume.
Seul le fichier de Louis est sous la cible (28 lignes / 14 opportunités au lieu de 20) — cause détaillée en fin de rapport.

## ⚠️ Point d'attention majeur : taux de sourcing nominatif à 10 %

19 contacts nominatifs sur 188 lignes. Les 169 autres sont livrés avec `nom`/`prenom`/`linkedin` vides et le tag `CONTACT_NON_SOURCE`.
Deux causes cumulées, identiques sur les 7 sous-agents :
1. **Proxy d'egress** : LinkedIn, Pappers, Societe.com, APEC, Indeed, HelloWork, France Travail, WTTJ, Taleez, Teamtailor, Flatchr, ainsi que la presse spécialisée (Usine Nouvelle, Journal des Palaces, L'Hôtellerie Restauration, Hospitality ON, CFNews, DAF-Mag, Option Finance, Le Journal des Entreprises, Maddyness, FrenchWeb) renvoient tous 403. Travail effectué à 100 % sur les snippets de recherche.
2. **Budget de recherche épuisé** : chaque sous-agent a atteint son plafond de 200 requêtes avant la passe de sourcing nominatif.

Conséquence opérationnelle : les fichiers sont exploitables comme **cartographie d'opportunités** (entreprise + poste + signal + lien), mais l'enrichissement contact reste à faire — via FullEnrich à l'import Propium, ou par une passe de sourcing manuelle. L'agent Sales général a montré la voie : 6 de ses 8 contacts nominatifs ont été obtenus via FullEnrich/Propium (~2,5 crédits).

Conséquence qualité : la **fraîcheur « 7 derniers jours » n'est pas confirmée** pour la majorité des annonces. Attention à la lecture de la colonne `notes` : le champ `Date:` porte la date de mapping (2026-09-30) conformément au format d'import, **pas la date de publication de l'annonce**. L'incertitude sur la date de publication est signalée en clair dans le texte du champ `notes`, sur 100 % des lignes des 5 fichiers (mentions « non confirmée », « non vérifiable », « estimée » ou `NC`). Sur le fichier Finance, 14 lignes portent en plus un `Date: NC` explicite. Aucune date n'a été extrapolée.

De même, l'effectif est `NC` pour la grande majorité des entreprises (non vérifiable sans Pappers) : le plafond des 2000 salariés a donc été appliqué par exclusion des employeurs connus comme dépassant le seuil, pas par vérification systématique.

## Top régions / villes / secteurs

**Départements** : Paris 75 (40 lignes), Loire-Atlantique 44 (11), Moselle 57 (8), Bouches-du-Rhône 13 (6), Haute-Garonne 31 (6), Côte-d'Or 21 (6), Gironde 33 (5), Corse-du-Sud 2A (4), Indre-et-Loire 37 (4), Isère 38 (4).

**Villes** : Paris (40), Aix-en-Provence, Tours, Toulouse, Reims, Cannes, Lyon, Bordeaux, Brest, Nantes (4 chacune), Ajaccio (2). 32 lignes en localisation `NC`.

**Secteurs dominants** : agroalimentaire et industrie de transformation, hôtellerie indépendante et châteaux-hôtels, cabinets d'expertise comptable régionaux, éditeurs SaaS B2B sous-médiatisés, distribution technique B2B (CVC, emballage).

**Équilibre géographique** : la consigne « privilégier les régions vs Paris/IdF » est respectée sur l'Industrie (Saint-Gérand 56, Torcheville 57, Vert-le-Grand 91) et le Sales général (Tours, Caen, La Roche-sur-Yon). La concentration parisienne vient surtout de Finance et Sales SaaS.

## Top 7 signaux business prioritaires

1. **Altho (marque Brets)** — Saint-Gérand (56) — 95 M€ investis dans une nouvelle usine, 443 salariés, CA 280 M€, DG Laurent Cavard nommé, montée en capacité à 25 000 t. Besoins production / maintenance / qualité massifs et durables. *→ Alexis*
2. **Castellet Hospitality** — sortie du minoritaire Three Hills Capital Partners, capital majoritaire repris par le fondateur Gilles Larrivé et des family offices (Hospitality ON, sept. 2026). Recomposition capitalistique = fenêtre de recrutement. *→ Valentin*
3. **Europa Group** — Toulouse (31) — 535 salariés, 160 M€ — LBO secondaire via fonds de continuation Abenex + build-up annoncé le 28/09/2026 (Life Science Access Academy, après K.I.T Group Berlin). Besoin conso / intercos / contrôle de gestion groupe. *→ Valentin*
4. **Mistertemp' group** — ~1100 collaborateurs, intérim digital indépendant — création de la fonction Trésorerie & Financements avec une équipe cible de 4-5 personnes (assurance-crédit, factor, reporting bancaire). Chantier de structuration complet, plusieurs postes à la clé. *→ Valentin*
5. **Chapitre Six** — rachat de l'hôtel 3.14 à Cannes au Groupe Partouche (>5 000 m²), plus grosse opération du groupe, réouverture 5* en 2027, plus projets Megève / Courchevel 1850 / Bus Palladium Paris. *→ Valentin*
6. **ecosio** — recrute son **premier** Account Executive France, ouverture du marché français adossée au mandat e-invoicing de septembre 2026. Création d'une équipe commerciale from scratch. *→ Louis*
7. **Le Comptoir CVC** — 3 annonces simultanées de technico-commerciaux itinérants (Tours 37, Caen 14, La Roche-sur-Yon 85) = extension de force de vente sur trois régions d'un coup. *→ Méroë*

**Signaux secondaires notables** : Axiome Associés (Christophe Delon élu président + intégration de 2 cabinets dans l'Hérault) ; Corse Composites Aéronautiques (Cadre Comptable en direct + 6 postes Qualité/Méthodes) ; SEMARDEL (4 postes maintenance ouverts simultanément) ; Loré (LBO primaire idiCo 8 M€ le 11/09/2026) ; GDCom Group (création d'un poste Grands Comptes Packaging, C1 et C2 nominatifs) ; Matera (internalisation de la paie) ; Hôtel Paris Sur Seine (Revenue Manager + Spa Manager simultanés).

## Levées de fonds et opérations PE du jour (fichier de Louis)

| Société | Fonds | Montant | Nature | Date |
|---|---|---|---|---|
| Loré (Bordeaux) | idiCo — fonds idiCo Expansion 4 | 8 M€ | LBO primaire + build-up Apoca | 11/09/2026 |
| Kheops | Odyssée Venture + ISAI + Elaia | 12 M€ (15 M€ selon une autre source, à reconfirmer) | Levée | S39 2026 |
| Zeliq | NC | 7 M€ | Levée | S39 2026 |
| Beamy | NC | 8 M€ | Série A, déploiement international | Non confirmée |
| EasyVista | NC | NC | Build-up | 2026, non confirmée |

## Récurrences

**Aucune récurrence confirmée sur la fenêtre 23 → 30 septembre 2026.**

31 des 214 entreprises déjà ciblées ces 14 derniers jours ont été re-testées. Aucun résultat de presse économique française postérieur au ~22 septembre n'est remonté : la semaine ne semble pas encore indexée, et tous les domaines permettant de vérifier une date sont bloqués par le proxy. Rien n'a été retenu plutôt que de forcer des dates incertaines. 16 entreprises restent non testées faute de budget de recherche (Cité Marine, BCF Life Sciences, Microphyt, LPG Systems, PLATTARD, Domes Pharma, Ingeliance, Deret, Machefert, Métropole Monte-Carlo, Institut Lyfe, ORCOM, AGPM, Prévoir, Smallable, Bobochic) — à relancer dans 3-4 jours.

Trois signaux forts mais **hors fenêtre 7 jours** (18-22 septembre, datés et vérifiables), à traiter comme du rattrapage :
- **PAREF Gestion** (Paris) — 3 nominations commerciales d'un coup (directeur réseaux de distribution + 2 responsables partenariats), 18/09 → structuration commerciale.
- **Stoïk** (Paris) — Xavier Marguinaud nommé VP Insurance, objectif > 210 salariés fin 2026 après une série C de 20 M€, 18/09.
- **BIO-UV Group** (Lunel) — 4 responsables commerciaux recrutés + 2 promotions sur la force de vente Piscine, ~22/09.

## 🔴 Alertes pipeline — entreprises à sortir du ciblage

- **Tessan** — en redressement judiciaire depuis le 28/04/2026.
- **Groupe Okwind** — sous PSE, ~89 postes menacés.

## Filtres appliqués

**Anti-doublons** : 214 entreprises ciblées sur les 14 derniers jours (32 fichiers scannés) ont été exclues de la recherche. Zéro collision constatée dans les 5 fichiers livrés.

**Plafond 2000 salariés (niveau groupe)** — exclusions explicites relevées par les agents : Réside Études, Korian, Cooperl, E.Leclerc, EDF/Framatome, SETEC, Paris Habitat, Descours & Cabaud, Rydge Tie-up, Maïsadour, Septeo, Funecap, Givenchy/LVMH, Caisse d'Épargne IDF, Starbucks France, Rexel, Wilo, Lallemand, Chausson Matériaux, Petit Navire/Thai Union, Groupe Bodemer, Bouygues Telecom, d'aucy, Volvo, Seat, NGE, SEB.

**Liste noire** : aucune entreprise des Big 4, du next tier (Mazars, Grant Thornton, BDO, RSM, Baker Tilly), des réseaux d'expertise comptable (In Extenso, Fiducial, Cerfrance, Exco, Sofarec), des scale-ups trop visibles ni du CAC 40. Brevo, Libeo et Malt ont été écartés par l'agent Sales SaaS pour surexposition médiatique.

**Chaînes hôtelières** : aucun établissement Accor, Marriott, Hilton, IHG, Hyatt, Rosewood, Four Seasons ou Mandarin Oriental. Les 20 opportunités Hospitality sont des hôtels indépendants, châteaux-hôtels, Relais & Châteaux, resorts et holdings de restauration.

**Employeur masqué** : annonces écartées chez Michael Page, Fed Finance, Robert Half, Manpower, Randstad, Menway, Winsearch, Camo Groupe, Actual, Achil, Talenteeds, Tamarin, Zanaka, Jobglober, Tylia, Crit, Lynx RH.

**Alternance / stage** : aucune annonce retenue (AB Compta écartée pour mention « apprenti »).

**Effectif < 5 salariés** : Kepplair Evolution, Greens du Monde et Cabinet JCM écartés par prudence, effectif non vérifiable.

**Titres hors périmètre Industrie** : aucun Business Developer, Head of, VP ou Chief dans le fichier d'Alexis.

## Dédoublonnage Sales Louis ↔ Méroë

**Aucune entreprise retirée.** Les 14 entreprises du fichier de Louis et les 20 du fichier de Méroë sont disjointes — la consigne de séparation sectorielle (SaaS pur chez Louis, secteurs non-SaaS chez Méroë) a bien fonctionné en amont. Le fichier de Méroë est livré complet à 40 lignes.

## Volumes non atteints — best-effort assumé

- **Sales SaaS (Louis)** : 14 opportunités sur 20, 28 lignes sur 40. Budget de recherche épuisé après ~12 requêtes, et tous les domaines de la presse tech française bloqués par le proxy.
- **Sales général (Méroë)** : 17 JOB + 3 NEWS au lieu de 14 + 6. Le volume total de 40 lignes est atteint, mais la part NEWS est faible : BIO-UV était déjà dans l'anti-doublons, et d'aucy / Volvo / Seat / NGE / SEB dépassaient le plafond groupe.
- **Industrie** : les familles logistique industrielle, chantier, technico-commercial industriel, achats et direction de site n'ont pas été couvertes, budget de recherche épuisé avant.

## 🔴 Incident de livraison — la boîte de Louis rejette tous les emails

L'email du jour destiné à `louis@humanup.io` a été **rejeté par le serveur** :

```
550 5.7.1 Your message was not delivered because the recipient is unable to
receive email. You can contact meroe@humanup.io instead.
```

Ce n'est ni un problème de pièce jointe ni de format : la boîte est hors service au niveau de l'administration Google Workspace, et le rebond redirige explicitement vers `meroe@humanup.io`.

**Ce n'est pas nouveau** : le même rejet s'est produit le 29/09 à 06:54 et à 08:27, sur des envois sans archive ZIP. Louis n'a donc reçu aucun fichier depuis au moins deux jours, et les runs précédents ne l'ont pas détecté — aucun n'avait vérifié les rebonds après envoi.

Décision à prendre : soit réactiver la boîte dans la console Google Workspace (ou corriger la règle de routage), soit retirer Louis de la liste de diffusion comme cela a été fait pour Marie Le Ret, pour éviter un rebond quotidien.

En attendant, `sales_saas_2026-09-30.csv` a été renvoyé à Méroë.

## Statut d'envoi des 4 emails

| Destinataire | Fichiers | Statut |
|---|---|---|
| valentin@humanup.io | finance + hospitality (ZIP) | ✅ Délivré |
| alexis@humanup.io | industrie (ZIP) | ✅ Délivré |
| louis@humanup.io | sales_saas (ZIP) | ❌ **Rejeté 550 5.7.1** — rerouté vers Méroë |
| meroe@humanup.io | sales (ZIP) + rapport en corps | ✅ Délivré |

**Note technique sur les pièces jointes** : les CSV partent désormais en archive ZIP (à dézipper avant l'import Propium). Le connecteur Gmail exige un base64 inline dans l'appel d'outil ; un CSV brut de 26 Ko représente ~53 000 tokens de sortie, au-delà de ce qu'un appel peut porter — c'est ce qui avait fait partir un CSV tronqué lors d'un run précédent. Zippé, le payload tombe sous 8 000 caractères. Le XLSX (57 000 caractères de base64, incompressible car déjà une archive) **n'est pas attachable** : il se récupère par `git pull`.

## Actions recommandées

1. **Enrichir avant d'appeler** : lancer FullEnrich à l'import Propium sur les 169 lignes `CONTACT_NON_SOURCE`, en commençant par les 7 signaux prioritaires ci-dessus.
2. **Revalider les dates** : la fraîcheur 7 jours n'est pas garantie. Le champ `Date:` des notes est la date de mapping, pas celle de l'annonce — vérifier la date de publication via le lien avant d'attaquer, surtout sur Finance et Hospitality.
3. **Sortir Tessan et Groupe Okwind** du pipe.
4. **Rattraper les 3 signaux hors fenêtre** (PAREF Gestion, Stoïk, BIO-UV Group) : ils sont datés et vérifiables.
5. **Relancer une passe de récurrences dans 3-4 jours** sur les 16 entreprises non testées.
6. **Trancher le cas de la boîte de Louis** (réactivation ou retrait de la diffusion) — c'est la seule action bloquante pour le run de demain.
