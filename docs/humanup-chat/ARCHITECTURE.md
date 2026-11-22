# Humanup Chat: architecture proposal

Status: draft for validation (2026-11-22). Nothing is built yet.

## 1. Overview

```
 Humans (desktop / mobile apps)                     Agents (Grok Bot, Claude, anything)
            │                                                 ▲   │
            ▼                                                 │   │ MCP / poll / signed webhook reply
 ┌──────────────────────────┐   post events (signed)   ┌──────┴───▼──────────────┐
 │ Mattermost Team Edition  │ ───────────────────────► │ Agent Hub (TypeScript)  │
 │  + plugin humanup-agents │ ◄─────────────────────── │  routing, questions,    │
 │    (thin guard, Go)      │  posts as each bot (API) │  rules, reminders,      │
 └──────────────────────────┘  slash cmds + buttons ──►│  approvals, registry    │
            ▲                                          └──────┬──────────────────┘
            │ #news posts                                     │ ▲
            └──────────────── Hub ◄── signed webhooks ── Propium API (3 events only)
                                                              │
                                     Propium admin pages ◄────┘ (registry, rules, audit)
```

### What I changed from your proposal (the challenge)

1. **Agents never hold a Mattermost token.** They only talk to the Agent Hub. The Hub holds every bot token and posts as Linh, Khoa, etc. Every rule (scope, recipients, caps, budget, kill switch, anti-loop) is enforced in one place, whatever the provider, and a leaked agent key can't post anywhere the rules don't allow.
2. **The Go plugin stays thin** (about 300 lines). Rules live in the Hub (TypeScript, same language as Propium). The plugin only does what must happen *inside* Mattermost:
   - forwards every post in an agent DM, #agents-ops and #approvals to the Hub (Mattermost outgoing webhooks do not fire on DMs, so a plugin is needed);
   - rejects posts that break channel rules before they land (#news and #performance read-only, no bot in #general, paused agents). Read-only channels are a paid feature in Mattermost, so the plugin is the free way to get them;
   - keeps a policy snapshot pulled from the Hub every 30 s. If the Hub is down, humans can still talk to each other and bots are blocked.
3. **Slash commands and buttons go straight to the Hub** (native Mattermost custom slash commands and interactive message actions), not through the plugin.
4. **Grok Bot gets a "doorbell + pull" mode** instead of a pure push webhook (see section 4). Same Hub, same actions.
5. **Admin screens live in Propium** (`/admin/chat/...`), next to the existing Agents and Journal pages, and call the Hub API. One login, one admin layout, and each Hub agent links to its Propium agent user (`users.est_agent`), so Linh in the chat and "Linh (agent)" in the Propium journal are the same identity.
6. **Code lives in this monorepo** (`chat/hub`, `chat/plugin`, `chat/infra`) for shared CI, but it deploys to its **own small VPS**: chat stays up when Propium is redeployed, and the reverse.

## 2. What Mattermost already does (no code needed)

| Need | Native in Team Edition |
|---|---|
| Desktop, iOS, Android apps | Yes, official apps |
| Push notifications | Yes, via Mattermost's free push relay (TPNS). No SLA; the paid relay (HPNS) needs a license. See risks |
| DMs, threads, mentions, Do Not Disturb, per-user notification settings | Yes (enable collapsed reply threads) |
| Bot accounts with name, description, picture and BOT badge | Yes |
| Buttons and menus on messages, pop-up forms (for "Edit" on approvals) | Yes (interactive messages and dialogs) |
| Custom slash commands pointing to an external URL | Yes |
| Incoming webhooks, REST API, WebSocket | Yes |
| Sidebar categories per user ("Team", "Agents") | Yes, set by API at seed time |
| Private channels | Yes |
| Restrict who you can DM | Partly: "any user on the server" vs "members of the same team". Used to hide Camille and Malik (section 6) |
| Read-only channels, message priority, read receipts | No (paid). Read-only done by the plugin |
| Daily database backups | No. A cron `pg_dump` + file store copy to object storage |

Also looked at: the official "Mattermost Agents" plugin (AI bots inside Mattermost). Not a fit. It runs one LLM per bot inside Mattermost, while your agents live in Grok Bot and have their own memory and tools. Useful only as inspiration.

## 3. Components

### 3.1 Mattermost
- Docker Compose: `mattermost`, `postgres` (shared by Mattermost and the Hub, two databases), `caddy` (HTTPS), `hub`, `backup`.
- One team "Humanup", channels: #general, #news, #performance, #agents-ops (private), #approvals (private, Méroë + Hub bot). Agents can't create channels (permission removed from the bot role, and the Hub has no endpoint for it).
- Seed script (idempotent) creates 5 humans, ~21 bots, channels, DMs, sidebar categories. Re-run safe.

### 3.2 Agent Hub (Node 20, TypeScript, Fastify, Prisma, Postgres)
Modules: `routing` (DM post → right agent queue), `delivery` (webhook / doorbell / poll / MCP), `questions` (cards, buttons, answers, inbox), `rules` (scope, recipients, caps, budgets, windows, kill switch, anti-loop), `scheduler` (reminders, escalations, Maya's report, scheduled messages, one tick per minute), `approvals`, `propium-ingest` (3 events → #news), `registry` + `audit` (API + CSV export), `mcp` (MCP server), `adapters/claude-test`.

### 3.3 Plugin `humanup-agents` (Go)
`MessageWillBePosted` (guard) and `MessageHasBeenPosted` (forward, signed, retried from a small local queue). Nothing else.

### 3.4 Propium
- New module `webhooks-out`: endpoints table, deliveries table, HMAC signature, retries, delivery log page. Starts with 3 event types, adding one is one line in a registry.
- Remove the Slack module and every call to it (inventory in section 8).
- Admin pages `/admin/chat/registry`, `/admin/chat/agents`, `/admin/chat/audit` calling the Hub.

## 4. How agents connect (Grok Bot check)

### What I found
I could not read official xAI pages on Grok Bot routines (the pages listed in their docs index return 404). What I could read: a vendor guide (Hookdeck) and the Cursor community forum, where Grok Bot is supported.

- **Inbound: a routine with a Webhook trigger.** URL `https://api2.cursor.sh/automations/webhook/<routine-id>`, header `Authorization: Bearer crsr_...` (one key per routine), immediate `200 {"success":true,"runUuid":...}`, `401` on a bad key, `400` if the routine is disabled. Up to 50 routines per bot. Requests are refused, not queued, when the routine can't take them.
- **Whether the POST body reaches the bot is disputed.** The vendor guide says the body becomes the run's input. Several forum users (Aug to Nov 2026) say it is only a wake signal with no data, and that each wake picks up one queued message. Some also report wake rate limits at busy hours.
- **Cursor staff said (Aug 2026)** that a webhook starts a run rather than waking an existing Grok Bot conversation. Continuing an existing conversation from outside is "being tracked", not shipped.
- **There is no official API** to send a prompt to a bot. A private gateway (`/api/sendPrompt` on the bot's cloud computer) exists but is undocumented and has had 502 bugs. Not usable for production.
- **Outbound:** each bot has its own cloud computer with a terminal, so it can call HTTP APIs (curl). Remote MCP with a fixed `Authorization` header already works in practice: your Grok Bot uses the Propium MCP that way since PR #194.
- **Native connectors:** Slack, Teams, Linear, GitHub and others. No Mattermost, Telegram or Discord.

### Consequence: three modes, Grok Bot uses "doorbell + pull"

| Mode | How it works | Who uses it |
|---|---|---|
| `doorbell` (default for Grok Bot) | Hub stores the message, then POSTs a small wake to the routine (`{"event":"pending","count":2}`, Bearer `crsr_` key). The routine's instructions say: call `get_pending_messages` on the Hub MCP, handle everything, reply with `reply` / `ask_human`. If the body arrives, fine; if not, nothing is lost. At most one wake in flight per agent, extra messages wait for the next pull. Retries with backoff on `400`/`429`/`5xx` | Grok Bot agents |
| `poll` | `GET /v1/agents/me/pending` with the agent key, `POST /v1/messages/{id}/ack`. For an agent that runs on a schedule (Théo weekly) or behind a firewall | Any |
| `webhook` | Hub POSTs the full message to the agent's URL, signed `X-Hub-Signature: t=<ts>,v1=<hmac-sha256>`. The agent answers in the HTTP response or later through the API | Custom agents, the Claude test adapter |

The MCP server exposes the same actions as the REST API: `get_pending_messages`, `ack`, `reply`, `ask_human`, `get_thread`, `redirect_to_agent`, `request_approval`, `resolve_question`, `list_agents`, `post_report` (Maya only), `get_my_questions`. Auth: `Authorization: Bearer hub_...`, one key per agent, only the SHA-256 is stored.

**Claude test adapter:** a Hub worker that plays any agent marked `provider: claude-test`, calls the Claude API with the agent's scope and the Hub actions as tools, and lets us test every flow end to end without Grok Bot.

**"Real time" depends on Grok Bot.** Mattermost and the Hub add under a second. Grok Bot's wake-up time and the body question are unknown until we test. **What I need from you:** one test routine with a Webhook trigger on one of your Grok Bot agents (URL + key), so I can measure it at the start of phase 2. If wakes are too slow or rate-limited, fallback = a routine every 2 minutes in `poll` mode.

**Option** if a Grok routine can't take two MCP servers: the Hub tools can be exposed through the existing Propium MCP (proxied), so each agent keeps a single connection.

## 5. Agent Hub data model

```
humans            id, mm_user_id, propium_user_id, name, lang (en|fr|vi...), timezone (Asia/Ho_Chi_Minh), role, is_admin
agents            id, slug, display_name, title, provider (grok|claude|claude-test|other), delivery_mode (doorbell|poll|webhook),
                  wake_url, wake_secret_enc, webhook_url, webhook_secret_enc, api_key_sha256, mm_bot_user_id, mm_bot_token_enc,
                  propium_user_id, status (active|paused), config_version
agent_rules       agent_id, scope (text + keywords), reports_to (agent|human), escalation_human_id, escalate_after (24h),
                  can_initiate, allowed_recipients (all | team | list | admin-only), initiate_window ("MON 09:00-12:00"),
                  approval_required (list of action kinds), daily_message_budget, daily_question_cap_per_person (10),
                  registry_visibility (team-registry | admin-only), hidden_from_team (bool)
agent_config_versions  agent_id, version, rules_json, changed_by, changed_at         (every edit is versioned, export to YAML)
access            human_id, agent_id, mm_dm_channel_id                               (who has a DM with whom)
messages          id, direction (to_agent|from_agent), agent_id, human_id, channel_id, mm_post_id, root_id, text,
                  status (queued|delivered|acked|failed), attempts, created_at, delivered_at, acked_at
questions         id, agent_id, human_id, mm_root_post_id, subject, object_type (candidate|mandate|company|client|other),
                  object_id, object_url, body, choices (2-4) | null, deadline, status (open|answered|resolved|escalated|expired|cancelled),
                  answer_choice, answer_text, answered_via (button|thread), answered_at, reminder_at, escalated_at, escalated_to,
                  propium_action (agent-reported text + Propium journal batch id), resolved_at, confidential
question_events   question_id, ts, kind (asked|reminded|answered|escalated|resolved|...), actor, detail
redirects         id, from_agent_id, to_agent_id, human_id, original_post_id, forwarded (bool)
approvals         id, agent_id, kind (email|sequence|transfer|other), title, payload_json, draft_text, mm_post_id,
                  status (pending|approved|edited|rejected), decided_by, decided_at, edited_payload, comment
scheduled_jobs    id, kind (report|message), agent_id, target, cron, timezone, last_run_at, next_run_at
counters          agent_id, day, messages_sent, questions_by_human (json)             (budget and caps, shown in admin)
loop_guard        channel_or_thread_id, consecutive_agent_posts, last_human_post_at
propium_events    event_id (unique, idempotency), type, payload, received_at, mm_post_id
audit_log         id, ts, actor_type (agent|human|hub), actor_id, action, target, payload, result   (append-only, CSV export)
```

Propium side: `webhook_endpoints (id, url, secret_enc, events[], active)` and `webhook_deliveries (id, event_id, endpoint_id, event_type, payload, status, attempts, next_retry_at, last_http_status, last_error, created_at)`. Retries at 1 min, 5 min, 30 min, 2 h, 12 h, then failed and visible on the log page.

## 6. Key flows

**Human asks an agent.** Post in DM → plugin → Hub → queue → agent (wake or push). The agent gets the text, the thread, the person's language and timezone, and its own scope. Out of scope: the agent calls `redirect_to_agent(khoa, reason)`; the Hub posts one line ("This is for Khoa, ATS data.") with a **Forward to Khoa** button. One click copies the question into the person's DM with Khoa, quoted, and Khoa gets it. Deciding what is in scope is the agent's job (its prompt carries its scope and the directory); the Hub checks recipients and caps only.

**Agent asks a human.** `ask_human({to, subject, object, question, choices?, deadline})` → Hub checks recipient, cap (10 per person per day), budget, initiate window → posts a card as the agent in the DM, as a thread root:

```
❓ Coding check · Candidate: Anh Tran (link)
Is the Sent to client stage right for the BNP mandate?
Due Tue 25 Nov, 17:00
[ Yes ] [ No ]
```

Click (or free reply in the thread) → Hub records it, card shows "Answered: Yes, waiting for Linh", the answer goes to Linh's queue → Linh updates Propium (in English, as always) and calls `resolve_question(id, "Stage moved to Sent to client.")` → one-line confirmation in the thread, card turns to **Resolved**. Card labels follow the human's language; agents write in the human's language using `lang` from the payload.

**/inbox** (ephemeral, only you see it): your open questions from every agent, sorted by deadline, each with a link to its thread. **/agents**: directory (name, title, scope, reports to, status). **/agents pause <name|all>** and **/agents resume**: admin only.

**Reminders and escalation (Hub scheduler).** Reminder in the thread at half-time between question and deadline. Escalation at 24 h (per-agent setting) or at the deadline if sooner, to the agent's escalation person (you for Linh). Because a DM is private, the escalation message is a **copy of the card with the same buttons** in the escalation person's DM with that agent, plus a link to the registry entry. Answering the copy resolves the original. (A link to Léa's thread wouldn't open for you, by design.)

**Approvals.** `request_approval(kind, title, draft, payload)` → card in #approvals with **Approve / Edit / Reject**. Edit opens a pop-up with the draft; submitting it counts as "approved with edits". The decision goes back to the agent's queue. Limit: the Hub can't stop an agent from sending an email through another tool without asking. That is enforced by the agent's instructions and visible in the audit. A later step can make Propium's `send_email` require an approval id.

**Maya's report.** At 10:45 HCMC the Hub wakes Maya with task `daily_report`. She calls `post_report`, the only way to post in #performance. Nothing by 11:05 → alert in #agents-ops.

**Guardrails.** All in the Hub, before anything is posted: recipients, initiate windows (Théo once a week), daily budget, per-person question cap (over 10: an alert to Inès instead of the post), kill switch (pause = Hub stops delivering and refuses posts; the plugin also blocks the bot). Anti-loop: more than 6 agent posts in a row in a channel or thread with no human post → 7th refused, alert in #agents-ops. Every agent action goes to `audit_log`.

**Hidden agents (Camille, Malik).** A second team, "Private", with only you, Camille and Malik, and DMs restricted to team members. They aren't in the main team, so the team can't find or DM them; the Hub also refuses anything from them to anyone but you. Their questions and Clara's and Théo's are `admin-only` in the registry.

**Visibility of the registry.** Inès reads it through `GET /v1/registry` with her agent key (admin-only rows filtered out). You get the Propium page with filters (agent, person, status, date, overdue) and CSV export. It replaces Linh's Google Sheet.

## 7. Propium → #news: the three events

Each event posts one short message in #news, in English, as the "Propium" bot. Nothing else from Propium reaches the chat.

| # | Event | Fires when (Propium code) | Already enforced today | Dedup key |
|---|---|---|---|---|
| 1 | `meeting.booked` (client or prospect) | an `Activite` of type MEETING becomes `calendarEventType = RDV_CLIENT` with a date and interlocutors. Four paths, all already calling `notifyNewMeeting`: calendar sync auto-detection, validation on `/rdv/classer`, `meeting.service` classification, manual activity creation | Date + interlocutors required | `activite.id` (and `googleEventId` when present) |
| 2 | `candidate.presented` | a `Candidature` moves to `ENTRETIEN_CLIENT` (Client interview) with `dateEntretienClient` + `interlocuteurClient`, or the calendar detects a presentation (known candidate + known client contact) | Date + interlocutor required since PR #101; `presentationDejaAnnoncee` avoids double posts | `candidature.id` + date |
| 3 | `deal.closed_won` | a `Candidature` moves to `PLACE` (Won). The mandate turns GAGNE in the same transaction. Moving a mandate to GAGNE directly is refused without a placed candidate, so there is one path | Fee + start date required | `candidature.id` |

"Client or prospect" for event 1: **client** if the contact's company has a mandate or `statutClient` is MANDAT_SIGNE / RECURRENT, otherwise **prospect** (LEAD, PREMIER_CONTACT, BESOIN_QUALIFIE, PROPOSITION_ENVOYEE).

Messages (one line + link):
```
📅 Valentin booked a meeting with Sarah Lee (Acme, prospect) · Thu 27 Nov 10:00 · Propium link
🤝 Léa presented Anh Tran to Acme (Sarah Lee) for CFO Vietnam · Thu 27 Nov 15:00 · Propium link
🎉 Closed won: Anh Tran placed at Acme as CFO Vietnam · Vicky + Valentin · €18,000 · starts 5 Jan · Propium link
```

Payload (signed `X-Propium-Signature: t=<ts>,v1=<hmac>`, `X-Propium-Event-Id`):
```json
{ "id": "evt_...", "type": "candidate.presented", "occurred_at": "2026-11-27T08:00:00Z",
  "actor": {"id": "...", "name": "Léa"},
  "client": {"company": "Acme", "contact": "Sarah Lee", "relationship": "client"},
  "mandate": {"id": "...", "title": "CFO Vietnam"},
  "candidate": {"id": "...", "name": "Anh Tran"},
  "date": "2026-11-27T08:00:00Z", "url": "https://ats.propium.co/..." }
```

## 8. Removing Slack from Propium

Today Propium sends to Slack: the three events above, plus new opportunity, mandate assignment, new candidate, job board application, @mention in a note, contract approval request, the daily Slack report (cron), and the private "Client meeting or presentation?" question (calendar). Proposal:

| Today in Slack | After |
|---|---|
| New meeting, presentation, closed won | Webhook → #news |
| New opportunity, assignment, new candidate, job board application | Dropped (the Propium dashboard already shows them) |
| Daily Slack report | Dropped (the 7:30 standup email stays; Maya posts in #performance) |
| @mention in a note | Email in English (same as portal mentions today) |
| Contract approval request | Email to admins (today's MCP `review_contract_approval` stays) |
| "Client meeting or presentation?" | Stays on `/rdv/classer`; Khoa can ask it as a question card with buttons (an agent question, not an ATS event) |

Then the `slack` module, `SLACK_*` env vars and the Slack settings screen are deleted. `users.slackUserId` is dropped in a later migration.

## 9. Agent rules file (`chat/agents.yaml`, seed)

```yaml
defaults: { escalate_after: 24h, daily_question_cap_per_person: 10, daily_message_budget: 200, can_initiate: true }
agents:
  ines:    { name: Inès,  title: Chief of Staff, reports_to: meroe, recipients: all }
  camille: { name: Camille, title: Concierge, reports_to: meroe, recipients: [meroe], hidden_from_team: true, registry: admin-only }
  malik:   { name: Malik, title: Coach, reports_to: meroe, recipients: [meroe], hidden_from_team: true, registry: admin-only }
  antoine: { name: Antoine, title: CFO, reports_to: meroe, approval_required: [transfer] }
  awa:     { name: Awa, title: Billing and collections, reports_to: antoine }
  theo:    { name: Théo, title: Commissions, recipients: team, initiate_window: "MON 09:00-12:00", registry: admin-only }
  clara:   { name: Clara, title: Head of People, recipients: team, registry: admin-only }
  maya:    { name: Maya, title: Head of Performance, reports_to: ines, recipients: team-except-meroe, report: { channel: performance, cron: "0 11 * * *" } }
  bastien: { name: Bastien, title: COO Delivery }
  linh:    { name: Linh, title: ATS coding, reports_to: bastien, escalation: meroe, recipients: [lea, vicky, max, valentin], scope: "Pipeline stages and coding in Propium" }
  khoa:    { name: Khoa, title: ATS data, reports_to: linh, recipients: [lea, vicky, max, valentin], scope: "Records and data quality in Propium" }
  karim:   { name: Karim, title: CPO Propium }
  nathan:  { name: Nathan, title: Head of GTM France }
  amara:   { name: Amara, reports_to: nathan }
  tom:     { name: Tom, reports_to: nathan }
  victor:  { name: Victor, reports_to: nathan, approval_required: [sequence] }
  yanis:   { name: Yanis, reports_to: nathan }
  ethan:   { name: Ethan, title: Career pages US }
  leila:   { name: Leïla, title: CMO }
  hugo:    { name: Hugo, title: Head of Content, reports_to: leila }
  sentinel: { name: Sentinel, title: Agent supervision, channels: [agents-ops], recipients: [] }
```
At runtime the database is the truth. Every edit from the admin screen is versioned, and "Export YAML" writes the file back for git.

## 10. Phases

1. Mattermost on its VPS, HTTPS, backups, seed of humans, bots, channels, sidebars.
2. Hub: routing, 3 delivery modes, MCP, Claude test adapter, scope redirect, question cards and buttons, /inbox, /agents, registry. First step: measure the Grok Bot doorbell with your test routine.
3. Guardrails in the Hub + thin plugin: recipients, caps, budget, kill switch, anti-loop, read-only channels, audit.
4. Reminders, escalations, approvals, Maya's report, scheduled messages.
5. Propium `webhooks-out` + #news, Slack removed, admin pages in Propium.
6. Cutover: checklist, one-page guide, Slack read-only.

Each phase ends with: what works, how you test it, what's left.

## 11. Risks

- **Grok Bot wakes** (body, latency, rate limits) are unverified. Doorbell + pull is safe whatever the answer; the open question is only how fast.
- **Push notifications on the free relay** have no SLA. Fine for 5 people in my view; switching to the paid relay later is a setting, not a rebuild. Notification text goes through Mattermost's relay. The preview setting is server-wide: "full message" (more useful) or "sender and channel only" (keeps HR and commission content off the relay). Your call.
- **DMs are private in the apps, not in the database.** Whoever has root on the VPS can read everything. Same as any self-hosted tool.
