# Plan d'implémentation — Système de Booking (style Calendly)

## Vue d'ensemble
Système de prise de RDV intégré à HumanUp ATS. Pages publiques permettant aux candidats/clients de réserver un créneau avec un recruteur. Connecté à Google Calendar, création auto dans l'ATS, rappels automatiques.

---

## Phase 1 : Modèle de données + Migration

### Prisma Schema (3 nouveaux modèles + modifications existantes)

**BookingSetting** (1 par recruteur) :
- `slug` (unique), `isActive`, `workingDays` (Int[]), `startTime/endTime`, `slotDuration`, `bufferMinutes`, `minNoticeHours`, `maxAdvanceDays`, `welcomeMessage`, rappels (booleans)

**Booking** :
- `userId` (recruteur), `mandatId?`, `entityType` (CANDIDAT/CLIENT), `entityId?`
- `firstName/lastName/email/phone/salary/currentCompany/availability/competingProcesses/message`
- `bookingDate`, `bookingTime`, `durationMinutes`, `calendarEventId`, `status`, `cancelToken`

**BookingReminder** :
- `bookingId`, `type`, `status`, `scheduledAt`, `sentAt`, `errorMessage`

**Modifications existantes :**
- `User` : ajouter `bookingSlug String? @unique`
- `Mandat` : ajouter `slug String? @unique`, `salaryRange String?`, `pitchPoints Json?`, `isBookingPublic Boolean @default(true)`

---

## Phase 2 : Backend — Service + Router publics

### Fichiers à créer :
- `apps/api/src/modules/booking/booking.service.ts`
- `apps/api/src/modules/booking/booking.router.ts`

### Endpoints publics (PAS d'auth) :
1. **GET /api/public/booking/:slug** — Infos recruteur (nom, titre, photo, settings dispo, mandats actifs)
2. **GET /api/public/booking/:slug/slots?date=2026-03-06** — Créneaux disponibles (calcul Google Calendar)
3. **POST /api/public/booking/:slug/book** — Réserver un créneau
4. **GET /api/public/booking/cancel/:id** — Page d'annulation (infos du booking)
5. **POST /api/public/booking/cancel/:id** — Confirmer l'annulation

### Endpoints authentifiés :
6. **GET /api/v1/booking/settings** — Lire ses settings de booking
7. **PUT /api/v1/booking/settings** — Sauvegarder ses settings
8. **GET /api/v1/booking/list** — Liste des bookings du recruteur
9. **PUT /api/v1/booking/:id/status** — Changer le status (no_show, completed, etc.)

### Logique du POST /book :
1. Valider données (email, téléphone, créneau dispo)
2. Re-vérifier Google Calendar (anti race condition)
3. Créer Candidat ou Client dans l'ATS
4. Si lien mandat → créer Candidature en stage "SOURCING"
5. Créer event Google Calendar
6. Créer le Booking en DB
7. Créer les BookingReminders
8. Envoyer email de confirmation (Gmail API)
9. Créer Notification pour le recruteur
10. Logger Activite (type MEETING)
11. Détecter séquence active → pause si match

### Calcul des créneaux :
1. Générer tous les créneaux selon settings (09:00, 09:30, 10:00...)
2. Fetch events Google Calendar pour la date
3. Retirer les créneaux qui chevauchent un event (+ buffer)
4. Retirer les bookings déjà existants
5. Appliquer délai minimum (2h) et maximum (30j)

---

## Phase 3 : Page publique de booking (Frontend)

### Fichiers à créer :
- `apps/web/src/pages/public-booking/index.tsx` (~800 lignes)

### Route (dans App.tsx) :
```
<Route path="/book/:slug" element={<PublicBookingPage />} />
<Route path="/book/:slug/:mandatSlug" element={<PublicBookingPage />} />
<Route path="/book/cancel/:bookingId" element={<BookingCancelPage />} />
```
Routes PUBLIQUES, en dehors du `<ProtectedRoute>`.

### Design :
- Fond #FAFAF9, card centrée max-w-[600px], radius 16px, shadow douce
- Logo HumanUp en haut
- Étape 1 : Calendrier (grille L-V, jours cliquables) + créneaux horaires (pills)
- Étape 2 : Formulaire (prénom, nom, email, tel, entreprise, dispo, process, message)
- Mini-pitch mandat si lien mandat (card violet-50, border-left brand-500)
- Confirmation : check vert animé, lien Google Calendar / Outlook
- Page annulation : message + bouton confirmer

### Anti-spam :
- Honeypot field caché
- Rate limit côté API (5 bookings/email/jour)
- Vérification email basique

---

## Phase 4 : Page Paramètres > Booking

### Modification :
- `apps/web/src/pages/settings/index.tsx` — Ajouter section "booking"

### Contenu :
- Toggle booking activé/désactivé
- Slug configurable + preview du lien + bouton copier
- Jours de travail (checkboxes L-D)
- Horaires début/fin
- Durée RDV (dropdown 15/30/45/60)
- Buffer, délai minimum, réservation max
- Message d'accueil
- Settings rappels (email veille, email 1h avant)
- Liste des liens par mandat actif (auto-générés)

---

## Phase 5 : Rappels automatiques (Cron)

### Ajout dans `apps/api/src/jobs/cron.ts` :
1. **Email veille (18h Paris)** — check toutes les 60s si 18h → envoyer rappels pour bookings du lendemain
2. **Email 1h avant** — check toutes les 15min → envoyer rappels pour bookings dans 60-75min

### Logique :
- Récupérer BookingReminders pending dont scheduledAt est passé
- Envoyer email via Gmail API
- Mettre à jour status (sent/failed)
- Si booking annulé → supprimer les reminders pending

---

## Phase 6 : Intégrations

### Mandat :
- Ajouter slug auto-généré à la création du mandat (slugify du titre + entreprise)
- Afficher le lien de booking sur la fiche mandat + bouton copier
- Champs `salaryRange` et `pitchPoints` éditables sur la fiche

### Séquences :
- Variable `{{booking_link}}` et `{{booking_link_mandate}}` dans les templates
- Auto-pause séquence quand booking détecté (même logique que detectReply)

---

## Ordre d'exécution des fichiers

1. `apps/api/prisma/schema.prisma` — Modèles + champs
2. Migration SQL
3. `apps/api/src/modules/booking/booking.service.ts` (~500 lignes)
4. `apps/api/src/modules/booking/booking.router.ts` (~200 lignes)
5. `apps/api/src/index.ts` — Register routers
6. `apps/web/src/pages/public-booking/index.tsx` (~800 lignes)
7. `apps/web/src/pages/public-booking/cancel.tsx` (~150 lignes)
8. `apps/web/src/App.tsx` — Routes publiques
9. `apps/web/src/pages/settings/index.tsx` — Section Booking
10. `apps/api/src/jobs/cron.ts` — Rappels
11. Mandat : slug + champs pitch + lien booking sur fiche
12. Séquences : variables template + auto-pause

**Estimation : ~15 fichiers, ~3000 lignes de code total**

---

## Points de décision

- **WhatsApp** : Non implémenté en V1 (pas d'API WhatsApp Business). Fallback email uniquement.
- **ICS file** : Généré côté frontend (lien Google Calendar / Outlook basé sur les params)
- **Photo recruteur** : Non implémenté en V1 (pas de champ photo sur User). Affiche initiales.
- **Rate limit public** : Via Fastify rate-limit plugin (déjà installé)
