# Guide MCP HumanUp - Piloter l'ATS avec Claude

## C'est quoi le MCP ?

Le MCP (Model Context Protocol) permet de **connecter Claude directement a l'ATS HumanUp**. Concretement, vous pouvez parler a Claude en langage naturel et il va chercher, creer, modifier vos donnees dans l'ATS — candidats, clients, mandats, taches, emails, stats — sans jamais quitter la conversation.

> **En resume** : au lieu de naviguer dans l'interface web pour chercher un candidat ou creer une tache, vous le demandez a Claude et il le fait pour vous.

---

## Installation (5 minutes)

### 1. Installer Claude Desktop

Telechargez Claude Desktop depuis [claude.ai/download](https://claude.ai/download) et connectez-vous avec votre compte Anthropic.

### 2. Configurer la connexion MCP

Ouvrez le fichier de configuration Claude Desktop :
- **Windows** : `%APPDATA%\Claude\claude_desktop_config.json`
- **Mac** : `~/Library/Application Support/Claude/claude_desktop_config.json`

Collez cette configuration :

```json
{
  "mcpServers": {
    "humanup": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://ats.propium.co/mcp",
        "--allow-http"
      ]
    }
  }
}
```

### 3. Premiere connexion

1. Redemarrez Claude Desktop
2. Claude va ouvrir une page de connexion dans votre navigateur
3. Connectez-vous avec **vos identifiants HumanUp habituels** (email + mot de passe)
4. Une fois connecte, revenez dans Claude Desktop — c'est pret !

> Vous devriez voir une icone d'outils (marteau) en bas de la fenetre de chat avec le nombre d'outils disponibles.

---

## Comment ca marche ?

### Parlez naturellement

Pas besoin de commandes speciales. Parlez a Claude comme a un collegue :

| Ce que vous dites | Ce que Claude fait |
|---|---|
| "Montre-moi mes mandats en cours" | Cherche vos mandats actifs |
| "Trouve-moi des devs React sur Paris" | Recherche dans le vivier de candidats |
| "C'est quoi la fiche de Jean Dupont ?" | Affiche la fiche complete du candidat |
| "Ajoute une note sur le candidat : Entretien positif, a rappeler" | Cree une note sur la fiche |
| "Cree une tache pour relancer Dupont lundi" | Cree la tache avec la date |

### Confirmation avant d'ecrire

Pour toutes les actions qui **modifient** des donnees (creer, modifier, supprimer), Claude vous demandera **toujours confirmation** avant d'agir. Il vous montrera un resume de ce qu'il s'apprete a faire.

Exemple :
> **Vous** : Cree un candidat Jean Martin, dev Java, Paris, 55k
>
> **Claude** : Je vais creer ce candidat :
> - Nom : Martin
> - Prenom : Jean
> - Poste : Dev Java
> - Ville : Paris
> - Salaire : 55k
>
> Tu confirmes ?
>
> **Vous** : Oui
>
> **Claude** : Candidat Jean Martin cree.

---

## Ce que vous pouvez faire

### Recherche et consultation (acces libre)

Ces actions sont instantanees, pas de confirmation requise.

**Candidats**
- "Cherche les candidats tagges Python a Lyon"
- "Montre-moi la fiche de Marie Leclerc"
- "Qui dans ma base pourrait correspondre au mandat Acme ?"

**Clients**
- "Trouve le client Pierre Moreau"
- "Quels sont mes clients avec statut MANDAT_SIGNE ?"

**Entreprises**
- "Cherche l'entreprise Capgemini"
- "Fiche complete de TotalEnergies"

**Mandats**
- "Mes mandats ouverts"
- "Montre-moi le pipeline du mandat Developpeur Senior"
- "Combien de candidats dans le mandat Acme ?"

**Taches**
- "Quelles sont mes taches en retard ?"
- "Mes taches de la semaine"

**Emails**
- "Mes derniers emails"

**Sequences**
- "Quelles sequences sont en cours ?"

**Stats et brief**
- "Mon brief du jour"
- "Mes stats de la semaine"
- "Mon calendrier d'aujourd'hui"
- "Mes liens de booking"

**Push CV**
- "Liste mes pushes de cette semaine"

**IA**
- "Prepare-moi un brief avant d'appeler Jean Dupont"
- "Appelle le 06 12 34 56 78" (via Allo VoIP)

### Actions avec confirmation

Claude vous demandera de valider avant d'executer.

**Creer**
- "Cree un candidat Sophie Durand, chef de projet, Bordeaux"
- "Cree un client chez L'Oreal : Marie Blanc, DRH"
- "Cree une entreprise Datadog, secteur Tech, Paris"
- "Cree une tache : relancer le client Moreau, priorite haute, pour jeudi"
- "Push le CV de Jean Dupont a Capgemini par email"

**Modifier**
- "Mets a jour le salaire de Jean Martin a 60k"
- "Change le LinkedIn de Sophie Durand"
- "Passe le client Moreau en MANDAT_SIGNE"
- "Change le secteur de Datadog en SaaS"

**Pipeline**
- "Ajoute Jean Martin au mandat Dev Senior"
- "Passe Jean Martin en ENTRETIEN_CLIENT sur le mandat Acme"
- "Retire Sophie Durand du mandat (raison : timing)"

**Notes et emails**
- "Ajoute une note sur Jean Dupont : Disponible a partir de juin"
- "Envoie un email a jean@example.com pour proposer un entretien"

**Supprimer**
- "Supprime le candidat Jean Test" (bloque si candidatures actives)

### Actions reservees Admin

| Action | Qui peut |
|---|---|
| Creer un mandat | Admin uniquement |
| Stats equipe | Admin uniquement |
| Brief equipe | Admin uniquement |
| Stats push equipe | Admin uniquement |

### Actions interdites (securite)

Ces actions sont **bloquees par securite** via MCP. Utilisez l'interface web :
- Supprimer un client, un mandat ou une entreprise
- Exporter la base de donnees
- Modifier les parametres systeme

---

## Exemples de workflows complets

### Workflow 1 : Sourcing rapide

```
Vous : Trouve-moi des profils Product Manager sur Paris

Claude : J'ai trouve 8 candidats Product Manager a Paris :
  1. Marie Leclerc — PM Senior chez Doctolib — 65k
  2. Thomas Petit — PM chez BlaBlaCar — 58k
  ...

Vous : Ajoute Marie Leclerc et Thomas Petit au mandat "PM Senior Acme"

Claude : Je vais ajouter ces 2 candidats au mandat PM Senior Acme en etape SOURCING.
Tu confirmes ?

Vous : Oui

Claude : Les 2 candidats ont ete ajoutes au pipeline.
```

### Workflow 2 : Brief matinal

```
Vous : C'est quoi mon programme aujourd'hui ?

Claude : Voici ton brief du 2 avril :
  - 3 RDV aujourd'hui (9h client Moreau, 14h entretien candidat, 16h call equipe)
  - 2 taches en retard (relance Dupont, envoyer contrat Leclerc)
  - 12 candidats en cours sur 4 mandats actifs
  - 3 nouveaux emails de candidats
```

### Workflow 3 : Suivi pipeline

```
Vous : Ou en est le mandat Developpeur Full Stack chez Acme ?

Claude : Mandat "Developpeur Full Stack" — Acme Corp
  Statut : EN_COURS | Fee : 18% (~12k)
  Pipeline :
    SOURCING (3) : Dupont, Martin, Leroy
    CONTACTE (2) : Blanc, Moreau
    ENTRETIEN_1 (1) : Durand
    ENTRETIEN_CLIENT (0)

Vous : Passe Durand en ENTRETIEN_CLIENT

Claude : Je deplace Sophie Durand de ENTRETIEN_1 vers ENTRETIEN_CLIENT.
Tu confirmes ?

Vous : Oui

Claude : Sophie Durand est maintenant en ENTRETIEN_CLIENT.
```

### Workflow 4 : Push CV

```
Vous : Push le CV de Marie Leclerc a TotalEnergies, contact Pierre Blanc, par email.
Voici le message : "Bonjour Pierre, suite a notre echange..."

Claude : Je vais creer ce push CV :
  - Candidat : Marie Leclerc
  - Prospect : TotalEnergies (Pierre Blanc)
  - Canal : EMAIL
  - Message : "Bonjour Pierre, suite a notre echange..."
Tu confirmes ?

Vous : Oui

Claude : Push cree. Une tache de relance a 48h a ete creee automatiquement.
```

---

## Astuces

1. **Pas besoin d'UUID** — Dites le nom du candidat/client/entreprise, Claude le trouvera tout seul
2. **Combinez les actions** — "Cree un candidat Jean Test et ajoute-le au mandat Acme" fonctionne
3. **Detection des doublons** — Si le candidat existe deja (meme nom ou email), Claude vous previent au lieu de creer un doublon
4. **Demandez le brief chaque matin** — C'est le meilleur moyen de demarrer la journee
5. **Historique** — Vos conversations sont sauvegardees dans Claude Desktop, vous pouvez les reprendre

---

## Depannage

### "Les outils ne s'affichent pas"
Redemarrez completement Claude Desktop (quitter l'app, pas juste fermer la fenetre).

### "Erreur d'authentification"
1. Verifiez que la config `claude_desktop_config.json` est correcte
2. Redemarrez Claude Desktop
3. Reconnectez-vous avec vos identifiants HumanUp quand la page de login s'ouvre

### "Session expiree"
Redemarrez Claude Desktop — une nouvelle session OAuth sera creee automatiquement.

### "Outil non trouve / action bloquee"
Certaines actions sont reservees aux admins ou bloquees par securite. Verifiez votre role avec votre responsable.

### Verifier que le serveur MCP fonctionne
Ouvrez dans votre navigateur : [https://ats.propium.co/mcp/health](https://ats.propium.co/mcp/health)
Vous devriez voir : `{"status":"ok", ...}`

---

## Tableau recapitulatif des 40+ outils

| Categorie | Outil | Description | Acces |
|---|---|---|---|
| **Candidats** | search_candidates | Rechercher des candidats | Libre |
| | get_candidate | Fiche complete d'un candidat | Libre |
| | create_candidate | Creer un candidat | Confirmation |
| | update_candidate | Modifier un candidat | Confirmation |
| | delete_candidate | Supprimer un candidat | Confirmation |
| | suggest_candidates_for_mandate | Suggestions pour un mandat | Libre |
| **Clients** | search_clients | Rechercher des clients | Libre |
| | get_client | Fiche complete d'un client | Libre |
| | create_client | Creer un client | Confirmation |
| | update_client | Modifier un client | Confirmation |
| **Entreprises** | search_companies | Rechercher des entreprises | Libre |
| | get_company | Fiche complete d'une entreprise | Libre |
| | create_company | Creer une entreprise | Confirmation |
| | update_company | Modifier une entreprise | Confirmation |
| **Mandats** | search_mandates | Rechercher des mandats | Libre |
| | get_mandate | Fiche complete d'un mandat | Libre |
| | get_mandate_pipeline | Pipeline d'un mandat | Libre |
| | create_mandate | Creer un mandat | Admin seul |
| | move_candidate_stage | Deplacer dans le pipeline | Confirmation |
| | add_candidate_to_mandate | Ajouter au pipeline | Confirmation |
| | remove_candidate_from_mandate | Retirer du pipeline | Confirmation |
| **Taches** | get_my_tasks | Mes taches | Libre |
| | create_task | Creer une tache | Confirmation |
| | complete_task | Terminer une tache | Confirmation |
| **Sequences** | get_my_sequences | Mes sequences | Libre |
| | get_sequence_details | Detail d'une sequence | Libre |
| | start_sequence | Lancer une sequence | Confirmation |
| | pause_sequence | Mettre en pause | Confirmation |
| **Emails** | get_my_emails | Mes derniers emails | Libre |
| | send_email | Envoyer un email | Confirmation |
| **Stats** | get_daily_brief | Brief quotidien | Libre |
| | get_my_stats | Mes statistiques | Libre |
| | get_my_calendar | Mon calendrier | Libre |
| | get_my_booking_links | Mes liens de booking | Libre |
| | get_team_stats | Stats equipe | Admin seul |
| | get_team_brief | Brief equipe | Admin seul |
| | get_recruiter_stats | Stats d'un recruteur | Admin seul |
| **IA** | get_call_brief | Brief pre-appel | Libre |
| | click_to_call | Lancer un appel VoIP | Libre |
| | validate_call_analysis | Valider analyse IA appel | Confirmation |
| **Notes** | add_note | Ajouter une note | Confirmation |
| **Push CV** | create_push | Creer un push CV | Confirmation |
| | list_pushes | Lister les pushes | Libre |
| | update_push_status | Changer statut push | Confirmation |
| | get_push_stats | Stats push equipe | Admin seul |
| **Candidatures** | get_job_applications | Candidatures spontanees | Libre |
| **Interdit** | delete_client / delete_mandate / delete_company | Suppression | Bloque |
| | export_database / modify_settings | Export / Parametres | Bloque |
