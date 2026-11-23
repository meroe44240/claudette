# Cutover: Slack → Humanup Chat (all at once)

Owner: Méroë. Server commands run on the Propium VPS in `/opt/humanup-chat/infra`.
Already done: Mattermost, people, agents, channels and sidebars; Agent Hub with rules and follow-ups; Propium posts its three announcements to #news and no longer to Slack (since 2026-11-23).

## Before day J

| # | What | How | Done |
|---|---|---|---|
| 1 | DNS record for the chat | GoDaddy › propium.co › DNS › Add: type **A**, name **chat**, value **178.104.32.138** | ☐ |
| 2 | HTTPS for the chat and the agents API | `./cutover.sh https`, wait a minute, then `./cutover.sh check` until every line is OK (ats.propium.co blinks a few seconds during `https`) | ☐ |
| 3 | Agent photos | One square image per agent in `chat/avatars/<key>.png`, copy to the server, `C="docker compose -f docker-compose.yml -f docker-compose.propium.yml"; $C build seed && $C run --rm seed` | ☐ |
| 4 | Connect each Grok Bot agent | In the agent's Grok Bot: add the MCP server `https://chat.propium.co/hub/mcp` with header `Authorization: Bearer <key>` (`./agent.sh key linh`), create a routine with a **Webhook** trigger and the instructions from `chat/hub/README.md` › Grok Bot. Then `./agent.sh doorbell linh <routine URL> <crsr_ key>`. Agents that run on a schedule: `./agent.sh poll <agent>`. `./agent.sh list` shows where everyone stands | ☐ |
| 5 | Maya's report | Her routine handles the `daily_report` task (10:45 Ho Chi Minh) with `post_report`. Until she is connected, #agents-ops gets a "report has not arrived" alert at 11:05 | ☐ |
| 6 | Agents that asked the team through Slack or email | Update their instructions: questions to a person go through `ask_human` (buttons when the answer can be closed), never Slack or email. Linh's Google Sheet is replaced by the registry (Propium › Admin › Registre des agents) | ☐ |
| 7 | Dry run, Méroë alone | Log in on desktop and phone, write to an agent, answer a question card, try `/inbox` and `/agents`, `/agents pause` then `resume` on one agent, look at a domain channel | ☐ |
| 8 | Push preview | Default: full message text in notifications. For "sender and channel only": `MM_PUSH_CONTENTS=generic` in `.env`, then `$C up -d mattermost` | ☐ |

## Day J (before the team starts, Ho Chi Minh time)

| # | What | How | Done |
|---|---|---|---|
| 9 | Emails on | `./cutover.sh email` (same Resend account as Propium, sent from noreply@humanup.io) | ☐ |
| 10 | Agents say hello | `./cutover.sh welcome`: one message per conversation, in each person's language, only where the conversation is still empty | ☐ |
| 11 | Invitations | `./cutover.sh invite`: everyone gets a "reset your password" email from Humanup Chat to choose their password | ☐ |
| 12 | Team guide | Share the one-page guide with the team: https://claude.ai/artifact/6QV69z2STeDbfXd2A6g75i (Share menu on the page; same text in `chat/docs/TEAM-GUIDE.md`) | ☐ |
| 13 | Slack read-only | Post the message below in Slack #general, pin it, then in Slack set each channel's posting permissions to admins only (channel settings › Posting permissions), or archive the channels. No history import: Slack stays the archive | ☐ |
| 14 | Everyone in | Each person installs the apps, logs in, sets do-not-disturb hours if they want. Check that everyone answered their agent's hello | ☐ |
| 15 | Final check | `./cutover.sh check`; the next client meeting, presentation or placement entered in Propium shows in #news | ☐ |

Message for Slack (#general):

> From today we work on **Humanup Chat**: https://chat.propium.co (desktop and mobile apps, guide attached). Your conversations with the agents, client meetings, presentations and closed won in #news, Maya's report in #performance. This Slack stays as a read-only archive. Check your email for the link to set your password.

## The first week

- Every morning: `/agents` (status, messages sent today against the budget, open questions) and #agents-ops (loops stopped, caps reached, missing report).
- Adjust caps, budgets, recipients and escalation delays in `chat/agents.yaml`, then restart the hub (`$C restart hub`).
- Backups: `docker compose exec backup backup.sh` once by hand; set `RCLONE_REMOTE` for a copy off the server.
- People who never answer: the registry (filter "Escalated only") shows them.

## If something goes wrong

- An agent misbehaves: `/agents pause <name>` (or `all`) in the app; its messages wait.
- The chat is down: `$C ps`, `$C logs --tail 50 mattermost hub`; Mattermost data is backed up daily (`chat/README.md` › Backups).
- Going back to Slack temporarily: turn Slack posting back on. Propium's announcements stay in #news only; sending them to Slack again would mean reverting PR #214.
