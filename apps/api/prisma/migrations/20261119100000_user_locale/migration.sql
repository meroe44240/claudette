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
WHERE lower(trim("prenom")) = 'max' AND lower(trim("nom")) = 'anderson';
