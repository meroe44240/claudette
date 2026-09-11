# Corrections de la routine Market Mapping — 2026-09-11

Deux sujets distincts :
- **Partie A** — retrait de Louis, bascule du fichier Sales SaaS vers Alexis (8 remplacements).
- **Partie B** — correction du run dégradé depuis le 03/09 (2 remplacements + 1 correctif déjà appliqué).

Les parties A et B se collent dans le prompt stocké de la tâche planifiée.
La seule exception est le §11, déjà appliqué dans le repo — rien à coller.

---
---

# PARTIE A — Retrait de Louis

Le fichier `sales_saas_{date}.csv` continue d'exister. Seul son destinataire change.

## 1. Liste de l'équipe (en-tête)

**Supprimer la ligne :**
> Louis (louis@humanup.io) — Sales dans le SaaS et les sociétés en portefeuille de fonds (levées de fonds, plans de recrutement, opérations PE)

**Remplacer la ligne Alexis par :**
> Alexis (alexis@humanup.io) — reçoit DEUX fichiers séparés : Industrie ET Sales SaaS / sociétés en portefeuille de fonds (levées de fonds, plans de recrutement, opérations PE)

**Ajouter, à côté de la ligne Marie Le Ret :**
> Louis ne fait plus partie de l'équipe : ne rien lui envoyer.

## 2. Tableau des sous-agents (Étape 2)

| Avant | Après |
|---|---|
| `Sales SaaS (Louis)` | `Sales SaaS (Alexis)` |

Nom de fichier et volume de 40 lignes inchangés.

## 3. Règle de dédoublonnage (Étape 2)

**Remplacer :**
> (les entreprises présentes chez Louis sont retirées du fichier de Méroë)

**Par :**
> (les entreprises présentes dans le fichier Sales SaaS sont retirées du fichier de Méroë)

## 4. Titre de la section verticale

**Remplacer :** `LOUIS — Sales SaaS + sociétés en portefeuille (1 sous-agent)`
**Par :** `ALEXIS — Sales SaaS + sociétés en portefeuille (1 sous-agent)`

Contenu de la section inchangé (cible 10-500 sal., exclusion licornes/Next40/FT120, postes SDR/BDR/AE/CSM,
signaux levées et opérations PE, sources Maddyness/CFNews/Capital Finance).

## 5. Onglet XLSX (Étape 3)

| Avant | Après |
|---|---|
| `Louis - Sales SaaS` | `Alexis - Sales SaaS` |

## 6. Rapport de synthèse (Étape 4)

**Remplacer :** `... par dédoublonnage avec Louis`
**Par :** `... par dédoublonnage avec le fichier Sales SaaS`

## 7. Envois email (Étape 6)

**Remplacer :** `Les 4 envois` → **`Les 3 envois`**
**Remplacer :** `Lancer les 4 sous-agents d'envoi en parallèle` → **`Lancer les 3 sous-agents d'envoi en parallèle`**

**Supprimer la ligne :**
> Louis (louis@humanup.io) : `sales_saas_{date}.csv`, corps = résumé + liste des levées/opérations PE du jour

**Remplacer la ligne Alexis par :**
> Alexis (alexis@humanup.io) : deux pièces jointes `industrie_{date}.csv` + `sales_saas_{date}.csv`,
> corps = résumé des deux verticales (volumes, contacts sourcés, top 3 signaux Industrie, liste des
> levées / opérations PE du jour), plus les points à valider (effectif groupe).

## 8. Pièces jointes multiples

Alexis reçoit désormais 2 fichiers, comme Valentin. Le 11/09, le sous-agent d'envoi de Valentin n'a pas pu
encoder les 2 CSV en un seul appel (base64 cumulé de 70 364 caractères) et a dû scinder en 2 messages.

**Ajouter aux instructions du sous-agent d'envoi :**

> Si le base64 cumulé des pièces jointes dépasse ~45 000 caractères, envoie un premier message avec le
> corps complet et la première pièce jointe, puis un second message **en réponse dans le même fil** avec
> la seconde. Vérifie l'intégrité (`base64 -d | cmp`) de chaque fichier avant envoi, **et le SHA256 après
> envoi pour les binaires (XLSX)** : le 11/09, un premier essai avait tronqué le base64 du XLSX sans
> aucune erreur visible — seule la vérification post-envoi l'a détecté.
>
> **Pour le message de suite, utilise `mcp__Gmail__send_message` avec `replyThreadId`, JAMAIS
> `mcp__Gmail__reply`** : l'outil `reply` n'accepte aucune pièce jointe (aucun paramètre `attachments`
> dans son schéma) et part silencieusement sans le fichier, sans lever d'erreur. Constaté le 11/09 : un
> message parasite sans PJ était arrivé dans le fil avant que l'envoi correct soit refait.

---
---

# PARTIE B — Correction du run dégradé

**Diagnostic.** Le quota WebSearch est un budget de **session partagé, servi au premier arrivé**. Les 8 agents
lancés en parallèle y puisent sans savoir qu'il est commun : les derniers trouvent la caisse vide. Et la règle
de sourcing du prompt demande à elle seule ~120 recherches par verticale (40 contacts × 3 essais), soit
~750 pour le run complet, contre 200 disponibles — un facteur 4.

Le décrochage date du **03/09**, quand les verticales sont passées de 3 à 5 :

| date | total lignes | contacts sourcés |
|---|---|---|
| 09-01 | 120 | 31 % |
| 09-02 | 120 | 43 % |
| **09-03** | 176 | **5 %** |
| 09-04 | 112 | 7 % |
| 09-07 | 196 | 43 % |
| 09-09 | 170 | 4 % |
| 09-10 | 152 | 5 % |
| 09-11 | 118 | 17 % |

## 9. Budget de recherche par sous-agent

Transforme une famine du dernier arrivé en dégradation homogène : plus de fichier à 4 lignes pendant qu'un
autre est à 40. **Ajouter dans les « Règles communes à toutes les verticales » :**

> ## BUDGET DE RECHERCHE (impératif)
> Le quota WebSearch est un **budget de session partagé entre tous les sous-agents**, pas un budget par agent.
> Tu disposes d'une enveloppe stricte de **{N} recherches WebSearch**. Au-delà, tu t'arrêtes et tu livres ce
> que tu as, en signalant le volume atteint dans ton résumé.
> Répartition indicative : **70 % pour identifier les opportunités**, 30 % pour vérifier effectifs et dates.
> Ne consomme jamais de recherche pour trouver un nom de contact : utilise FullEnrich (voir §10).

Valeurs de `{N}` (total 730, marge de 70 sur les 800 configurés) :

| Sous-agent | N |
|---|---|
| Hospitality | 130 |
| Industrie | 130 |
| Sales SaaS | 130 |
| Sales général | 130 |
| Finance A | 60 |
| Finance B | 60 |
| Finance C | 50 |
| Récurrences | 40 |

## 10. Sourcing nominatif via FullEnrich au lieu de WebSearch

C'est le correctif au plus fort rendement : **80 % du budget de recherche part aujourd'hui dans le sourcing
de noms, qui est précisément ce qui échoue le plus** (17 % de réussite le 11/09). On dépense la ressource
rare sur l'activité la moins productive.

`mcp__ats-propium__search_people_external` prend directement `company_names` + `job_titles` + `locations`,
pour **0,25 crédit par résultat**. Solde vérifié le 11/09 : **9 684 crédits**, soit ~25 crédits/jour pour
100 contacts → plus d'un an d'autonomie.

**Remplacer tout le bloc « Sourcing nominatif (max 3 essais par contact, mode best-effort) » par :**

> ## SOURCING NOMINATIF (via FullEnrich, sans consommer de WebSearch)
> 1. Appelle `mcp__ats-propium__search_people_external` avec `company_names: ["{entreprise}"]`,
>    `job_titles: ["{poste cible}"]`, `locations: ["{ville}"]`, `limit: 3`.
> 2. Si aucun résultat, élargis **une seule fois** : retire `locations`, ou élargis `job_titles`
>    (ex. « Directeur Administratif et Financier » → « DAF », « CFO », « Responsable Financier »).
> 3. Toujours rien → `nom`, `prenom`, `linkedin` vides + `CONTACT_NON_SOURCE` dans les tags.
>
> **N'utilise WebSearch pour chercher un nom que si FullEnrich est indisponible**, et alors 1 seul essai.
> **JAMAIS inventer un nom.** Ne reporte que ce que la source renvoie — si le poste exact n'est pas confirmé,
> écris-le tel quel et marque « à confirmer » dans les notes.

## 11. Plafond de recherche porté à 800 — ✅ DÉJÀ APPLIQUÉ

Créé dans `.claude/settings.json` du repo (committé, donc présent dès le clone du conteneur — un
`settings.local.json` n'aurait pas survécu) :

```json
{
  "env": {
    "CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION": "800"
  }
}
```

Variable vérifiée dans le binaire Claude Code et présente dans la liste des variables configurables par
settings. **Rien à coller pour ce point.**

---

## Point non corrigeable : le proxy

Les 403 sur LinkedIn, Pappers, APEC, France Travail, Journal des Palaces, Usine Nouvelle et CFNews viennent
de la **policy d'egress de l'organisation**, pas d'une erreur de configuration. Le README du proxy est
explicite : « Do not retry or route around it — report the blocked host. »

Conséquence assumée : `WebFetch` reste inopérant et le travail continue sur les snippets WebSearch, donc les
dates de publication resteront souvent en `NC`. Débloquer ces domaines relève d'une demande à l'administrateur
de l'organisation. Les §9-11 compensent le volume, pas cette limite-là.
