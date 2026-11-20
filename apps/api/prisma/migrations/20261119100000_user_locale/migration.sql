-- Langue et fuseau par membre (source unique pour l'interface, les emails et les contenus IA).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferred_language" VARCHAR(5);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" VARCHAR(64);

-- Reprise du fuseau déjà choisi dans Humanup Notes (seulement s'il a été changé du défaut).
UPDATE "users" u
SET "timezone" = n."timezone"
FROM "note_user_settings" n
WHERE n."user_id" = u."id" AND u."timezone" IS NULL AND n."timezone" <> 'Europe/Paris';

-- Max Anderson : anglais, heure de Ho Chi Minh.
UPDATE "users"
SET "preferred_language" = 'en', "timezone" = 'Asia/Ho_Chi_Minh'
WHERE "id" = 'f6176f9c-9c66-4891-9572-7e4bb03e9c0e'
   OR (lower(trim("prenom")) = 'max' AND lower(trim("nom")) = 'anderson');

-- Langue des sous-titres donnée au bot : si elle était devinée ou s'avère fausse,
-- l'audio est retranscrit (langue détectée) avant d'écrire les notes.
ALTER TABLE "note_calls" ADD COLUMN IF NOT EXISTS "captions_language" VARCHAR(5);
ALTER TABLE "note_calls" ADD COLUMN IF NOT EXISTS "captions_guessed" BOOLEAN NOT NULL DEFAULT false;
