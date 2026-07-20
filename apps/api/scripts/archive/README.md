# Scripts one-shot exécutés — Archive

Ces scripts ont été exécutés une fois en prod et conservés pour référence historique.
**Ne pas relancer sans lire le code d'abord** — ils font des writes idempotents mais peuvent créer du bruit.

| Script | Exécuté | Rôle |
|---|---|---|
| `create-user-vicky.ts` | 2026-06 | Créer l'utilisatrice Vicky Deletang (RECRUTEUR) |
| `assign-mandat-crystal-to-vicky.ts` | 2026-06 | Réassigner les mandats Crystal Placement à Vicky |
| `assign-vicky-sourceur-privateaser.ts` | 2026-06 | Attacher Vicky comme sourceuse sur tous les mandats Privateaser |

⚠️ **Sécurité** : `create-user-vicky.ts` contient un mot de passe en clair (`Humanup2026`). Il a servi de mot de passe initial, forcé au changement à la 1re connexion (`mustChangePassword: true`). Si ce mot de passe est encore actif sur un environnement, le changer.
