#!/usr/bin/env bash
# Builds (with Docker, no Go needed on the host) and installs the humanup-agents plugin,
# configured with the Agent Hub's plugin secret. Safe to re-run after a plugin change.
# Usage (from chat/infra):  ./install-plugin.sh -f docker-compose.yml -f docker-compose.propium.yml
set -euo pipefail
cd "$(dirname "$0")"
C=(docker compose "$@")
[[ -s .secrets/hub-plugin-secret ]] || { echo "Start the hub first (it creates .secrets/hub-plugin-secret)" >&2; exit 1; }

docker run --rm -v "$PWD/../plugin":/src -w /src golang:1.26 bash build.sh
PKG=$(ls -t ../plugin/dist/*.tar.gz | head -1)

mm() { "${C[@]}" exec -T mattermost mmctl --local "$@"; }
"${C[@]}" cp "$PKG" mattermost:/tmp/humanup-agents.tar.gz
mm plugin add /tmp/humanup-agents.tar.gz --force >/dev/null
# The Mattermost image has no shell: settings go in through a copied file, overwritten afterwards.
# Private folder on the host; the file itself must be readable by the Mattermost user in the container.
dir=$(mktemp -d) && chmod 700 "$dir" && cfg="$dir/humanup-agents.json"
printf '{"PluginSettings":{"Plugins":{"humanup-agents":{"huburl":"http://hub:3100","hubsecret":"%s"}}}}' \
  "$(cat .secrets/hub-plugin-secret)" > "$cfg" && chmod 644 "$cfg"
"${C[@]}" cp "$cfg" mattermost:/tmp/humanup-agents.json
mm config patch /tmp/humanup-agents.json >/dev/null
echo '{}' > "$cfg" && "${C[@]}" cp "$cfg" mattermost:/tmp/humanup-agents.json && rm -rf "$dir"
mm plugin enable humanup-agents
# Mattermost's own AI plugin ("Agents") is not used here and would be confused with ours.
mm plugin disable mattermost-ai >/dev/null 2>&1 || true
mm plugin list | sed -n '1,6p'
