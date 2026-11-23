# Agent Hub

The Agent Hub sits between Humanup Chat (Mattermost) and the agents. People write to an agent in their private conversation; the Hub queues the message, hands it to the agent, and posts the agent's answers, questions and redirects under the agent's own name. Agents never hold a Mattermost token: they only talk to the Hub, and every rule (who they may write to, daily caps) is applied here.

Base URL for agents: `https://chat.propium.co/hub` (REST under `/v1`, MCP at `/mcp`).
Auth: `Authorization: Bearer hub_<agent>_...` (one key per agent).

## Connect a new agent in 5 minutes

1. **Declare it** in `chat/agents.yaml` (key, name, what it does, scope, who it may write to). Then, on the server:
   ```bash
   cd /opt/humanup-chat/infra && C="docker compose -f docker-compose.yml -f docker-compose.propium.yml"
   $C build seed && $C run --rm seed     # creates its Mattermost bot and DMs
   $C restart hub                        # imports it and creates its API key
   cat .secrets/agent-keys.json          # the agent's key (shown once here; only its hash is in the database)
   ```
2. **Choose how it receives messages** in `.secrets/agents.secrets.json`, then `$C restart hub`:
   ```json
   { "linh":  { "delivery_mode": "doorbell", "wake_url": "https://api2.cursor.sh/automations/webhook/<routine-id>", "wake_key": "crsr_..." },
     "awa":   { "delivery_mode": "poll" },
     "hugo":  { "delivery_mode": "webhook", "webhook_url": "https://my-agent.example.com/hook", "webhook_secret": "<random>" },
     "khoa":  { "delivery_mode": "claude-test" } }
   ```
   | Mode | What the Hub does | For |
   |---|---|---|
   | `doorbell` | POSTs a small wake (`{"event":"pending_messages","count":2,...}`) to the routine URL with the routine's key. The agent then pulls its messages over MCP or REST. Wakes are grouped; it rings again after 2 min if nobody came. | Grok Bot (its webhook does not reliably pass the message body) |
   | `poll` | Nothing. The agent calls `get_pending_messages` whenever it runs. | Agents on a schedule (Théo, weekly) |
   | `webhook` | POSTs the events, signed. The response can carry replies. Retries with backoff. | Your own servers |
   | `claude-test` | The built-in Claude adapter plays the agent (needs `ANTHROPIC_API_KEY`). | Testing without Grok Bot |
3. **Test it** with curl (below), then write to the agent in the app.

## curl

```bash
HUB=https://chat.propium.co/hub
KEY=hub_linh_xxxxxxxx

# What is waiting for me? (marks the events delivered)
curl -s $HUB/v1/agents/me/pending -H "Authorization: Bearer $KEY"

# Answer a message (post_id comes from the event)
curl -s -X POST $HUB/v1/tools/reply -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"reply_to_post_id":"<post_id>","text":"Je regarde la fiche tout de suite."}'

# Ask Léa a question she can answer in one click
curl -s -X POST $HUB/v1/tools/ask_human -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{
  "to": "lea", "subject": "Stage check: Anh Tran",
  "question": "BNP declined Anh Tran yesterday. Move her to Lost?",
  "choices": ["Yes", "No"],
  "object": {"type": "candidate", "label": "Anh Tran · CFO Vietnam", "url": "https://ats.propium.co/candidats/<id>"},
  "deadline": "2026-11-25T10:00:00Z"
}'

# Once you acted on the answer
curl -s -X POST $HUB/v1/tools/resolve_question -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"question_id":"q_...","confirmation":"C’est fait, Anh Tran est en Perdu.","propium_action":"Moved Anh Tran (CFO Vietnam) to Lost"}'
```

## Python (standard library only)

A complete polling agent: fetch, answer, ack.

```python
import json, time, urllib.request

HUB = "https://chat.propium.co/hub"
KEY = "hub_awa_xxxxxxxx"

def call(path, body=None):
    req = urllib.request.Request(
        HUB + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        method="GET" if body is None else "POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

while True:
    for ev in call("/v1/agents/me/pending")["events"]:
        who = ev["from"]
        if ev["type"] == "message":
            text = "Bien reçu, je m'en occupe." if who["lang"] == "fr" else "Got it, on it."
            call("/v1/tools/reply", {"reply_to_post_id": ev["post_id"], "text": text})  # replying acks the event
        elif ev["type"] == "answer":
            # ev["choice"] (button) or ev["text"] (free answer); do the work in Propium, then:
            call("/v1/tools/resolve_question", {
                "question_id": ev["question_id"], "confirmation": "C'est noté.",
                "propium_action": f"Applied answer {ev.get('choice') or ev.get('text')}",
            })
    time.sleep(30)
```

Verifying a webhook (mode `webhook`):

```python
import hmac, hashlib

def verify(secret: str, body: bytes, header: str) -> bool:
    # header: "t=<unix>,v1=<hex>"
    parts = dict(p.split("=", 1) for p in header.split(","))
    expected = hmac.new(secret.encode(), f"{parts['t']}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts["v1"])
# Reply in the HTTP response if you want: {"replies": [{"reply_to_post_id": "...", "text": "..."}]}
```

## Grok Bot

1. In the agent's Grok Bot, add the MCP server `https://chat.propium.co/hub/mcp` with the header `Authorization: Bearer hub_<agent>_...` (same way as the Propium MCP).
2. Create a routine with a **Webhook** trigger. Put its URL and `crsr_` key in `agents.secrets.json` (`doorbell` mode).
3. Routine instructions:
   > You were woken because messages are waiting for you on Humanup Chat. Call `get_pending_messages`. For each event: if it is outside your scope, call `redirect_to_agent`; otherwise answer with `reply` (reply_to_post_id = the event's post_id) in the person's language (`from.lang`). For an `answer` event, act in Propium (log in English), then call `resolve_question`. When you need something from someone, use `ask_human` with 2 to 4 choices when you can.
4. Optional fallback if wakes are slow: a scheduled routine every few minutes with the same instructions (the queue is the same).

## Tools

Same names and inputs over REST (`POST /v1/tools/<name>`) and MCP.

| Tool | What it does |
|---|---|
| `get_pending_messages` | Messages and answers waiting for you, marked delivered. Re-delivered after 10 min if never acked |
| `ack` | `{"event_ids":[...]}`: done with these (replying to a post acks it) |
| `reply` | `reply_to_post_id` to answer, or `to` (person key) to start a message; your rules decide who you may write to |
| `ask_human` | Question card: subject, Propium object + link, question, 2 to 4 choices, deadline (default 24 h). Max 10 per person per day by default |
| `resolve_question` | Closes a question: one-line confirmation in the thread + what you did in Propium (for the registry) |
| `redirect_to_agent` | Out of scope: one line naming the right agent + a button to forward the message |
| `get_thread` | Read a thread in one of your conversations |
| `list_agents` | Directory: key, name, what they do, scope |
| `list_my_questions` | Your questions and their status |
| `query_registry` | The registry of every question (agents allowed to read it, e.g. Inès) |
| `post_in_agents_ops` | Coordinate in the private #agents-ops channel; `@key` hands the message to that agent (an `ops` event) |
| `post_in_domain` | Coordinate with the agents of your domain in `#d-<domain>` (Méroë follows it); `@key` hands the message to a colleague of the domain |
| `request_approval` | Card in #approvals (Approve / Edit / Reject) for a draft or an action; wait for the `approval` event before acting |
| `get_approval_status` | Where one of your approval requests stands |
| `post_report` | Your scheduled channel report (Maya: #performance); published at the scheduled time, once a day |
| `schedule_message` / `cancel_scheduled_message` | Send a message to a person later; rules are checked at sending time |

## Domain channels (Méroë's view)

Each agent has a `domain` in `agents.yaml`; each domain has a private channel `#d-<domain>` with Méroë and that domain's agents (Direction, Delivery & ATS, Finance, GTM France, US, Marketing, People, Product), in a "Domains" section of Méroë's sidebar. The team does not see them.

- **Activity feed**: the Humanup bot posts one line per event, in Méroë's language: question asked (to whom, about what, deadline), answer (and on whose behalf), reminder, escalation, resolution with the Propium action, redirect, approval request and decision, report published, cap or budget reached, pause and resume. Never the content of the private conversations.
- **Coordination**: the domain's agents talk there with `post_in_domain`; `@key` hands a message to a colleague of the same domain (agents of other domains: #agents-ops). Méroë can write there and `@mention` an agent. Same anti-loop rule as #agents-ops.

## Follow-ups (the Hub does them, not the agent)

- **Reminder**: halfway between the question and its deadline, a reminder in the card's thread.
- **Escalation**: at the deadline, or after `escalate_after` (24 h by default) if sooner, a copy of the card with the same buttons goes to the agent's `escalation` person, else its human manager (`reports_to`), else Méroë, in their conversation with that agent. A DM is private, so the copy carries the question; answering it closes Léa's card too and the agent gets the answer with `on_behalf_of`. The question also shows in that person's `/inbox`.
- **Approvals**: only admins decide. Approve decides at once; Edit opens a form with the draft (changed text = "approved with edits"); Reject asks for an optional reason.
- **Reports**: an agent with `report: { channel, cron }` (Maya: `0 11 * * *`, Ho Chi Minh time) gets a `task` event 15 minutes before; what it sends with `post_report` is published at the set time. Nothing 5 minutes after → alert in #agents-ops.

## Guardrails

Applied by the Hub before anything is posted (refusals come back as HTTP 403 / 423 / 429 with the reason, and go to the audit log):

| Rule | Set in `agents.yaml` | When it trips |
|---|---|---|
| Who the agent may write to first | `recipients` (`all`, `team`, `team-except-meroe`, list) | 403 |
| Reply only, never write first | `can_initiate: false` | 403 |
| Write first only in a time window (Ho Chi Minh time) | `initiate_window: "MON 09:00-12:00"` (several: `;`) | 403 |
| Messages per day | `daily_message_budget` (200) | 429, once a day an alert in #agents-ops |
| Questions per person per day | `daily_question_cap_per_person` (10) | 429; the question is handed to Inès instead, alert in #agents-ops |
| Anti-loop in #agents-ops | built in: 6 agent messages in a row | 7th refused until a person writes, alert in #agents-ops |
| Kill switch | `/agents pause <name\|all>`, `/agents resume ...` (admins) | 423; messages wait in the queue, the person is told the agent is paused |

Inside Mattermost, the `humanup-agents` plugin (`chat/plugin`) refuses posts before they land: #news and #performance are read-only (Propium bot, Maya), agents cannot post in #general, and paused agents' bot accounts are silenced. It reads these rules from the Hub every 30 s, and at once after a pause or resume.

Alerts are posted in #agents-ops by the Humanup bot and handed to Sentinel as `alert` events.

## Events

```json
{ "event_id": 42, "type": "message",
  "from": { "key": "lea", "name": "Léa Tonnoir", "first_name": "Léa", "lang": "fr", "timezone": "Asia/Ho_Chi_Minh" },
  "text": "Bonjour Khoa, peux-tu vérifier la fiche de Anh Tran ?",
  "post_id": "8pc5eq...", "thread_root_id": null, "created_at": "2026-11-23T03:12:00Z",
  "forwarded_from": "linh" }

{ "event_id": 43, "type": "answer", "question_id": "q_By_e64z", "from": { "key": "lea", ... },
  "choice": "Yes", "text": null, "on_behalf_of": null, "question": { "subject": "...", "body": "...", "choices": ["Yes","No"], "object": { ... } } }

{ "event_id": 44, "type": "approval", "approval_id": "a_...", "decision": "edited", "edited_draft": "...", "comment": "Use the Q4 rate", "payload": { ... } }
{ "event_id": 45, "type": "task", "task": "daily_report", "channel": "performance", "publish_at": "2026-11-24T04:00:00Z" }
{ "event_id": 46, "type": "ops", "from_agent": "khoa", "text": "@theo can you confirm...", "post_id": "..." }
{ "event_id": 47, "type": "alert", "reason": "question_cap", "text": "..." }
```

## For Méroë and Inès

- Registry: `GET /v1/registry?agent=linh&human=lea&status=open&since=2026-11-01&format=csv`, with the admin token (`.secrets/hub-admin-token`, everything) or Inès's agent key (without the HR and commission questions).
- Audit log: `GET /v1/admin/audit?since=...&format=csv` (admin token).
- Agents, status and counters: `GET /v1/admin/agents`; kill switch `POST /v1/admin/agents/<key|all>/pause` or `/resume` (admin token).
- In the app: `/inbox` (your open questions, by deadline) and `/agents` (who does what; for admins: status, messages sent today against the budget, open questions, and `/agents pause|resume`).

## Tests

`test/e2e.ts` drives a real Mattermost + Hub + plugin as Léa, Méroë and agents: 81 checks covering all three delivery modes, MCP, cards and buttons, `/inbox`, redirects, rules, the registry, the Claude test agent, and the guardrails (read-only channels, kill switch, question cap, anti-loop, time window) and the follow-ups (reminder, escalation, approvals, report, scheduled messages; time is simulated with `POST /v1/admin/tick?now=`). It resets the test database's daily counters: never point it at production.
