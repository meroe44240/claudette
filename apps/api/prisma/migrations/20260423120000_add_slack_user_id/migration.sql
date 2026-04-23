-- Add slackUserId to users for direct messaging via Slack bot token
ALTER TABLE "users" ADD COLUMN "slackUserId" VARCHAR(30);
