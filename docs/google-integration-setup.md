# Guide de Configuration — Intégrations Google

## Prérequis
- Un compte Google Workspace (ou Gmail personnel pour les tests)
- Accès à la Google Cloud Console

---

## 1. Créer un Projet Google Cloud

1. Rendez-vous sur [console.cloud.google.com](https://console.cloud.google.com)
2. Cliquez sur **Sélectionner un projet** → **Nouveau projet**
3. Nom : `HumanUp ATS`
4. Cliquez **Créer**

---

## 2. Activer les APIs

Dans le menu **APIs & Services** → **Bibliothèque**, activez :
- **Gmail API**
- **Google Calendar API**
- **Google Drive API** (optionnel, pour les transcripts)

---

## 3. Configurer l'Écran de Consentement OAuth

1. Allez dans **APIs & Services** → **Écran de consentement OAuth**
2. Choisissez :
   - **Interne** si vous avez Google Workspace (recommandé)
   - **Externe** sinon (nécessite vérification Google pour la production)
3. Remplissez :
   - Nom de l'application : `HumanUp ATS`
   - Email d'assistance : votre email
   - Logo : optionnel
4. **Scopes** — ajoutez :
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.readonly`
5. **Utilisateurs tests** — ajoutez vos emails de test (mode externe uniquement)

---

## 4. Créer les Identifiants OAuth 2.0

1. Allez dans **APIs & Services** → **Identifiants**
2. Cliquez **+ Créer des identifiants** → **ID client OAuth**
3. Type d'application : **Application Web**
4. Nom : `HumanUp ATS`
5. **URI de redirection autorisés** :
   - Développement : `http://localhost:3001/api/v1/integrations/gmail/callback`
   - Production : `https://app.humanup.io/api/v1/integrations/gmail/callback`
6. Cliquez **Créer**
7. **Copiez** le Client ID et le Client Secret

---

## 5. Gmail — Notifications Push (Pub/Sub)

Pour recevoir les emails en temps réel :

1. Activez **Cloud Pub/Sub API** dans la bibliothèque
2. Allez dans **Pub/Sub** → **Topics** → **Créer un topic**
   - ID du topic : `humanup-gmail-notifications`
3. Sur le topic, ajoutez le membre :
   - `gmail-api-push@system.gserviceaccount.com` avec le rôle **Éditeur Pub/Sub**
4. Créez un **abonnement Push** :
   - URL du point de terminaison : `https://app.humanup.io/api/v1/integrations/gmail/webhook`
5. Appelez l'API Gmail Watch (se fait automatiquement dans l'app après connexion)

---

## 6. Google Calendar — Webhooks

Les webhooks Calendar sont configurés automatiquement par l'application via l'API `channels.watch`. Assurez-vous que votre domaine est vérifié dans la Google Search Console si vous utilisez la production.

---

## 7. Variables d'Environnement

Ajoutez dans votre fichier `.env` :

```
# Google OAuth
GOOGLE_CLIENT_ID=votre-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=votre-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/v1/integrations/gmail/callback

# Production
# GOOGLE_REDIRECT_URI=https://app.humanup.io/api/v1/integrations/gmail/callback
```

---

## 8. Connexion dans l'Application

1. Connectez-vous à HumanUp en tant qu'admin
2. Allez dans **Paramètres** → **Intégrations**
3. Cliquez **Connecter** sur Gmail et/ou Google Calendar
4. Autorisez l'accès dans la fenêtre Google
5. Vous êtes connecté ! Les emails et événements seront synchronisés automatiquement.

---

## Dépannage

| Problème | Solution |
|----------|----------|
| Erreur 403 "access_denied" | Vérifiez que l'email est ajouté comme utilisateur test |
| Erreur "redirect_uri_mismatch" | Vérifiez l'URI de redirection dans la console Google |
| Emails non synchronisés | Vérifiez que le topic Pub/Sub est correctement configuré |
| Token expiré | L'app renouvelle automatiquement les tokens. Si le problème persiste, déconnectez et reconnectez. |
