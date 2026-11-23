#!/usr/bin/env bash
# Connect an agent to Humanup Chat (run on the server from /opt/humanup-chat/infra).
#   ./agent.sh list                              how each agent receives its messages
#   ./agent.sh key linh                          Linh's Hub key (for her Grok Bot MCP config; keep it private)
#   ./agent.sh doorbell linh <routine-url> <crsr_key>   Grok Bot: the Hub wakes this routine
#   ./agent.sh poll linh                         the agent comes to fetch its messages itself
#   ./agent.sh webhook hugo <url>                the Hub pushes signed events (a secret is generated and shown once)
#   ./agent.sh claude-test linh                  the built-in Claude adapter plays the agent (tests)
# Changes go to .secrets/agents.secrets.json; the hub restarts to apply them.
set -euo pipefail
cd "$(dirname "$0")"
C=(docker compose -f docker-compose.yml -f docker-compose.propium.yml)
node_in_hub() { "${C[@]}" exec -T hub node -e "$1" -- "${@:2}" </dev/null; }

case "${1:-}" in
  list)
    node_in_hub "
      const fs = require('fs'); const p = '/secrets/agents.secrets.json';
      const s = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
      const keys = Object.keys(JSON.parse(fs.readFileSync('/secrets/agent-keys.json', 'utf8')));
      for (const k of keys) console.log(k.padEnd(10), (s[k]?.delivery_mode ?? 'poll (default: no routine yet)'), s[k]?.wake_url ?? s[k]?.webhook_url ?? '');"
    ;;
  key)
    [[ -n "${2:-}" ]] || { echo "Usage: ./agent.sh key <agent>" >&2; exit 1; }
    node_in_hub "const k = require('/secrets/agent-keys.json')[process.argv[1]]; if (!k) { console.error('Unknown agent'); process.exit(1); } console.log(k)" "$2"
    ;;
  doorbell|poll|webhook|claude-test)
    mode=$1; agent=${2:-}
    [[ -n "$agent" ]] || { echo "Usage: ./agent.sh $mode <agent> ..." >&2; exit 1; }
    [[ $mode != doorbell || ( -n "${3:-}" && -n "${4:-}" ) ]] || { echo "Usage: ./agent.sh doorbell <agent> <routine-url> <crsr_key>" >&2; exit 1; }
    [[ $mode != webhook || -n "${3:-}" ]] || { echo "Usage: ./agent.sh webhook <agent> <url>" >&2; exit 1; }
    node_in_hub "
      const fs = require('fs'); const crypto = require('crypto'); const p = '/secrets/agents.secrets.json';
      const [mode, agent, a, b] = process.argv.slice(1);
      if (!require('/secrets/agent-keys.json')[agent]) { console.error('Unknown agent ' + agent); process.exit(1); }
      const s = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
      const entry = { delivery_mode: mode };
      if (mode === 'doorbell') Object.assign(entry, { wake_url: a, wake_key: b });
      if (mode === 'webhook') {
        const secret = s[agent]?.webhook_secret ?? crypto.randomBytes(24).toString('base64url');
        Object.assign(entry, { webhook_url: a, webhook_secret: secret });
        console.log('Webhook secret for ' + agent + ' (give it to the agent, shown once): ' + secret);
      }
      s[agent] = entry;
      fs.writeFileSync(p, JSON.stringify(s, null, 2), { mode: 0o600 });
      console.log(agent + ': ' + mode);" "$mode" "$agent" "${3:-}" "${4:-}"
    "${C[@]}" restart hub </dev/null >/dev/null && echo "Hub restarted."
    ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
