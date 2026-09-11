# Patch du prompt de la routine — retrait de Louis, bascule Sales SaaS vers Alexis

À appliquer dans le prompt stocké de la tâche planifiée (là où la routine est configurée).
8 remplacements. Le fichier `sales_saas_{date}.csv` continue d'exister — seul son destinataire change.

---

## 1. Liste de l'équipe (en-tête)

**Supprimer la ligne :**
> Louis (louis@humanup.io) — Sales dans le SaaS et les sociétés en portefeuille de fonds (levées de fonds, plans de recrutement, opérations PE)

**Remplacer la ligne Alexis par :**
> Alexis (alexis@humanup.io) — reçoit DEUX fichiers séparés : Industrie ET Sales SaaS / sociétés en portefeuille de fonds (levées de fonds, plans de recrutement, opérations PE)

**Ajouter, à côté de la ligne Marie Le Ret :**
> Louis ne fait plus partie de l'équipe : ne rien lui envoyer.

---

## 2. Tableau des sous-agents (Étape 2)

| Avant | Après |
|---|---|
| `Sales SaaS (Louis)` | `Sales SaaS (Alexis)` |

Le nom de fichier `outputs/sales_saas_{date}.csv` et le volume de 40 lignes ne changent pas.

---

## 3. Règle de dédoublonnage (Étape 2)

**Remplacer :**
> dédoublonne `sales_{date}.csv` contre `sales_saas_{date}.csv` sur la colonne `entreprise` (les entreprises présentes chez Louis sont retirées du fichier de Méroë)

**Par :**
> dédoublonne `sales_{date}.csv` contre `sales_saas_{date}.csv` sur la colonne `entreprise` (les entreprises présentes dans le fichier Sales SaaS sont retirées du fichier de Méroë)

---

## 4. Titre de la section verticale

**Remplacer :**
> LOUIS — Sales SaaS + sociétés en portefeuille (1 sous-agent)

**Par :**
> ALEXIS — Sales SaaS + sociétés en portefeuille (1 sous-agent)

Le contenu de la section (cible 10-500 sal., exclusion licornes/Next40/FT120, postes SDR/BDR/AE/CSM,
signaux levées et opérations PE, sources Maddyness/CFNews/Capital Finance) reste inchangé.

---

## 5. Onglet XLSX (Étape 3)

| Avant | Après |
|---|---|
| `Louis - Sales SaaS` | `Alexis - Sales SaaS` |

---

## 6. Rapport de synthèse (Étape 4)

**Remplacer :**
> Entreprises retirées du fichier Sales de Méroë par dédoublonnage avec Louis

**Par :**
> Entreprises retirées du fichier Sales de Méroë par dédoublonnage avec le fichier Sales SaaS

---

## 7. Envois email (Étape 6)

**Remplacer le titre :**
> Les 4 envois → **Les 3 envois**

**Remplacer :**
> Lancer les 4 sous-agents d'envoi en parallèle (un par destinataire).

**Par :**
> Lancer les 3 sous-agents d'envoi en parallèle (un par destinataire).

**Supprimer la ligne :**
> Louis (louis@humanup.io) : `sales_saas_{date}.csv`, corps = résumé + liste des levées/opérations PE du jour

**Remplacer la ligne Alexis par :**
> Alexis (alexis@humanup.io) : deux pièces jointes `industrie_{date}.csv` + `sales_saas_{date}.csv`,
> corps = résumé des deux verticales (volumes, contacts sourcés, top 3 signaux Industrie, liste des
> levées / opérations PE du jour), plus les points à valider (effectif groupe).

---

## 8. Note technique sur les pièces jointes multiples

Alexis reçoit désormais 2 fichiers, comme Valentin. Sur le run du 2026-09-11, le sous-agent d'envoi de
Valentin n'a pas pu encoder les 2 CSV en un seul appel (base64 cumulé de 70 364 caractères) et a dû
scinder en 2 messages d'un même fil.

Pour éviter ça, ajouter dans les instructions du sous-agent d'envoi :

> Si le base64 cumulé des pièces jointes dépasse ~50 000 caractères, envoie un premier message avec le
> corps complet et la première pièce jointe, puis un second message **en réponse dans le même fil**
> avec la seconde pièce jointe. Vérifie l'intégrité (`base64 -d | cmp`) de chaque fichier avant envoi,
> et le SHA256 après envoi pour les binaires (XLSX).
