# Market Mapping Humanup.io — 2026-09-18

## ⚠️ AVERTISSEMENT QUALITÉ — RUN DÉGRADÉ

Ce run est livré en mode best-effort dégradé. Deux limites d'infrastructure ont bridé
la recherche :

1. **Quota WebSearch de session épuisé (200/200)**, mutualisé entre les 7 sous-agents.
   Chaque verticale n'a disposé que de ~25-35 requêtes au lieu du budget habituel.
2. **Proxy d'egress bloquant (403 CONNECT)** sur tous les domaines de sourcing :
   `pappers.fr`, `societe.com`, `google.com`, `welcometothejungle.com`, LinkedIn,
   Indeed, Hellowork, France Travail, et même les sites corporate des entreprises.

**Conséquence principale : 3 contacts nominativement sourcés sur 102 lignes (2%).**
Les 99 autres lignes portent le tag `CONTACT_NON_SOURCE` : l'entreprise, la ville, le
poste cible et le contexte sont réels et vérifiés, mais le nom de la personne n'a pas
pu être identifié. **Aucun nom n'a été inventé** — conformément à la règle d'intégrité.

**Impact opérationnel** : ces fichiers restent exploitables pour un ciblage entreprise
(qui recrute quoi, où, avec quel contexte), mais l'enrichissement FullEnrich sera peu
performant sans nom. **Un nouveau run avec quota WebSearch frais est recommandé** pour
compléter le sourcing nominatif sur les 47 entreprises identifiées.

## Volumes par verticale

| Verticale | Destinataire | Lignes livrées | Cible | Taux | Entreprises | Contacts sourcés |
|---|---|---|---|---|---|---|
| Finance | Valentin Murcia | 22 | 40 | 55% | 11 | 2 |
| Hospitality | Valentin Murcia | 36 | 40 | 90% | 16 | 0 |
| Industrie | Alexis | 22 | 40 | 55% | 11 | 0 |
| Sales SaaS | Louis | 16 | 40 | 40% | 6 | 1 |
| Sales général | Méroë Nguimbi | 6 | 40 | 15% | 3 | 0 |
| **TOTAL** | | **102** | **200** | **51%** | **47** | **3 (2%)** |

Répartition : 80 lignes JOB / 22 lignes NEWS.

Détail Finance (merge A+B+C) : Part A (compta + contrôle de gestion) 12 lignes,
Part B (audit + cabinet + conso + fiscalité) 4 lignes, Part C (paie + tréso + DAF) 6 lignes.

## Top régions / villes / secteurs

**Villes** : Paris (75) domine avec 42 lignes, suivi de Lille (59) et Avoriaz (74) à 4
lignes chacune, puis Toulon (83), Torcé (35), Sète (34), Villefranche-sur-Saône (69),
Saint-Witz (95), Honfleur (14), Colmar (68), Val Thorens (73), La Pommeraye (49).

**Régions** : l'Industrie respecte la consigne de priorité régionale — 100% des
11 entreprises sont hors Paris/IdF (Bretagne, Hauts-de-France, Pays de la Loire,
Occitanie, ARA, BFC). La surpondération parisienne vient de l'Hospitality (hôtellerie
indépendante parisienne très active en M&A ce mois) et du SaaS.

**Secteurs** : hôtellerie indépendante et stations de montagne (Hospitality) ;
menuiserie industrielle, agroalimentaire et ingrédients, mécanique (Industrie) ;
cabinets d'expertise comptable régionaux indépendants et ETI (Finance) ; SaaS RH,
sales intelligence et visioconférence (Sales SaaS) ; santé animale, distribution BTP,
ESN (Sales général).

## Top 7 signaux business prioritaires

1. **Korner Hotels** (Paris) — rachète son 13e hôtel parisien (Le Carladez Cambronne)
   après un financement de 40 M€. Groupe hôtelier indépendant en consolidation active :
   besoins récurrents en réception, housekeeping et direction d'exploitation.
2. **Alfred Hotels** (Paris 17e) — rachète Les Jardins de la Villa, qui deviendra le
   1er 4 étoiles du groupe, après 70 M€ levés. Montée en gamme = recrutements
   qualifiés (F&B, front office, direction).
3. **FenêtréA** (Beignon, 56) — nouvelle usine de 20 000 m², 30 M€ investis,
   ~100 emplois créés. Le plus gros volume de recrutement industriel du jour.
4. **Summer Hotels** (Nice, 06) — 1er groupe hôtelier indépendant azuréen, rachète
   l'Hôtel Azuréa et ouvre son capital à Bpifrance, Sofipaca et BNP Paribas
   Développement. Entrée de fonds = structuration RH à venir.
5. **Outline** (ex-Alan, Paris) — lève 3 M$ en seed le 2026-09-08 auprès de
   Founders Future (lead), 100in et Newschool, pour du pilotage financier IA.
   Signal le plus frais du jour ; équipe commerciale à construire de zéro.
6. **Fidsud** (Toulouse / Sète, 430 sal., 44 M€ CA) — renouvelle sa gouvernance et
   vise 90 M€ de CA en 2030 via build-up régional (intégration Axia/Agen en janv. 2026).
   Cible Finance idéale : croissance par acquisition = besoins conso et audit.
7. **Groupe Okwind** (Torcé, 35 — 127 sal., 23,8 M€ CA) — nomination d'Olivier Dattin
   (ex-EY) comme DAF. Seul contact nominatif du jour côté Finance ; transition
   énergétique en forte croissance.

Autres signaux notables : **Eurogerm** (Saint-Apollinaire, 21) nouvelle usine de
bio-fermentation d'ingrédients boulangers ; **Bretim** (Pluméliau-Bieuzy, 56) extension
atelier/siège ~1 M€ ; **Ceralp** (Villefranche-sur-Saône, 69) en discussions de
rapprochement avec le groupe Cofimé ; **La Fourche** crée un poste de Responsable
Comptable après une levée de 31,5 M€.

## Recurrences

**Aucune récurrence confirmée aujourd'hui** — non pas par absence de signal, mais par
impossibilité technique de vérification : le sous-agent dédié a trouvé le quota
WebSearch déjà épuisé, et tous les replis WebFetch (Google News, Bing, DuckDuckGo,
sites officiels) ont été rejetés par le proxy d'egress. Conformément à la règle
anti-fabrication, aucune entrée n'a été inventée.

Travail préparatoire réalisé et exploitable au prochain run : comptage de fréquence sur
les 14 derniers jours (398 entreprises déjà ciblées). **Candidats prioritaires à
re-vérifier en premier** : ORCOM (vue 3 fois), puis ~60 entreprises vues 2 fois dont
I-TRACING, Ekimetrics, Audencia, Groupe Deret, AFNOR Group, All In Group.

## Filtres appliqués

- **Anti-doublons 14 jours** : 398 entreprises déjà ciblées extraites de 48 fichiers CSV,
  toutes exclues de la recherche du jour. Aucun doublon dans les livrables.
- **Plafond effectif strict < 2000 salariés (niveau groupe)** : appliqué.
  **Société Bretonne de Volaille retirée du fichier Industrie** (2 lignes) — 12 sites,
  risque fort de dépassement du plafond, effectif groupe non vérifiable avec le proxy
  bloqué. Prudence appliquée : intégrité privilégiée au volume.
- **Liste noire** : appliquée et déterminante côté Finance Part B, où la quasi-totalité
  des cabinets trouvés ont été écartés (Big 4, Mazars, BDO, Grant Thornton, Baker Tilly)
  ou provenaient d'intermédiaires masquant l'employeur final (Club Comptable, Bernard
  Mallet Conseil, Michael Page, Robert Half) — d'où seulement 4 lignes livrées.
- **Exclusion alternance / stage / apprentissage** : appliquée.
- **Groupes hôteliers exclus** (Accor, Marriott, Hilton, IHG, Hyatt, Rosewood,
  Four Seasons, Mandarin Oriental) : appliquée — le fichier Hospitality ne contient que
  des indépendants et petits groupes familiaux français.
- **Colonnes `email` et `telephone`** : vides sur les 102 lignes (vérifié), pour
  enrichissement FullEnrich.

## Dédoublonnage Sales Méroë / Louis

**Aucune entreprise retirée.** Les 3 entreprises du fichier de Méroë (Groupe Dômes
Pharma, Pro'Fil, Ikighia) n'apparaissent pas dans le fichier de Louis (Skello, Modjo,
Livestorm, Klaxoon, Toucan Toco, Outline). La consigne de diversification sectorielle
donnée au sous-agent Sales général a bien évité le recouvrement.

Le fichier de Méroë passe toutefois sous les 40 lignes (6 lignes) — non pas à cause du
dédoublonnage, mais du quota de recherche épuisé.

## À valider par l'équipe

Effectif groupe non confirmé (proxy bloqué sur Pappers et Societe.com) — à vérifier
avant prospection, principalement pour Alexis : Cité Marine, Ingeliance Technologies,
Eurogerm, Prime Engineering, Groupe Piment, ORAH Conseil, E2S.

## Recommandation

Relancer un run de complément dès que le quota WebSearch est réinitialisé, en ciblant
en priorité (a) le sourcing nominatif des 47 entreprises déjà identifiées ci-dessus —
le travail de qualification entreprise est déjà fait et n'a pas à être refait — et
(b) la vérification des récurrences sur la liste de candidats prioritaires.
