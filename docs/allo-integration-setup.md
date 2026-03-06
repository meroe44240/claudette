# Guide de Configuration — Intégration Allo (Téléphonie VoIP)

## Prérequis
- Un compte Allo (withallo.com)
- Accès administrateur à votre espace Allo

---

## 1. Obtenir la Clé API

1. Connectez-vous à [app.withallo.com](https://app.withallo.com)
2. Allez dans **Paramètres** → **API / Intégrations**
3. Générez une nouvelle clé API
4. Copiez la clé (elle ne sera plus affichée)

---

## 2. Configurer le Webhook

1. Dans les paramètres Allo, section **Webhooks**
2. Ajoutez un nouveau webhook :
   - **URL** : `https://app.humanup.io/api/v1/integrations/allo/webhook`
   - **Événements** : cochez `call.ended` (et `call.started` si disponible)
3. Copiez le **secret de signature** du webhook

---

## 3. Variables d'Environnement

Ajoutez dans votre fichier `.env` :

```
# Allo VoIP
ALLO_API_KEY=votre-cle-api-allo
ALLO_BASE_URL=https://api.withallo.com
ALLO_WEBHOOK_SECRET=votre-secret-webhook
```

---

## 4. Configuration dans l'Application

1. Connectez-vous à HumanUp en tant qu'admin
2. Allez dans **Paramètres** → **Intégrations**
3. Dans la section Allo, entrez votre clé API
4. Cliquez **Activer**
5. L'URL du webhook est automatiquement configurée

---

## 5. Fonctionnement

Une fois configuré :
- **Appels entrants/sortants** : chaque appel terminé crée automatiquement une activité dans HumanUp
- **Matching automatique** : le numéro de téléphone est comparé avec les fiches candidats et clients
- **Notifications** : le recruteur reçoit une notification pour chaque appel
- **Timeline** : les appels apparaissent dans la timeline de la fiche concernée

---

## 6. Mapping des Numéros

Pour que le matching fonctionne correctement :
- Assurez-vous que les numéros de téléphone dans HumanUp sont au format international (+33...)
- L'app normalise automatiquement les formats (06..., +33..., 0033...)

---

## Dépannage

| Problème | Solution |
|----------|----------|
| Appels non détectés | Vérifiez l'URL du webhook dans Allo |
| Pas de matching | Vérifiez que le numéro existe dans une fiche candidat/client |
| Erreur 401 | Régénérez la clé API et mettez à jour .env |
| Webhook non reçu | Vérifiez que votre serveur est accessible publiquement (pas localhost) |

---

## API Allo — Référence

- Documentation : [help.withallo.com/en/api-reference](https://help.withallo.com/en/api-reference/introduction)
- Base URL : `https://api.withallo.com`
- Auth : Header `Authorization: Bearer VOTRE_CLE_API`
- Endpoints utilisés :
  - `GET /v1/calls` — Historique des appels
  - `GET /v1/contacts` — Contacts Allo
  - `POST /v1/webhooks` — Créer un webhook
  - `DELETE /v1/webhooks/:id` — Supprimer un webhook
