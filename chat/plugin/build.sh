#!/usr/bin/env bash
# Builds dist/humanup-agents-<version>.tar.gz. Needs Go 1.26+, or Docker:
#   docker run --rm -v "$PWD":/src -w /src golang:1.26 ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' plugin.json | head -1)
cd server
[ -f go.mod ] || go mod init github.com/humanup/humanup-agents >/dev/null 2>&1
go get github.com/mattermost/mattermost/server/public@v0.6.1 >/dev/null
go mod tidy >/dev/null
for arch in amd64 arm64; do
  CGO_ENABLED=0 GOOS=linux GOARCH=$arch go build -trimpath -ldflags="-s -w" -o dist/plugin-linux-$arch .
done
cd ..
rm -rf build && mkdir -p build/humanup-agents/server/dist dist
cp plugin.json build/humanup-agents/
cp server/dist/plugin-linux-* build/humanup-agents/server/dist/
tar -czf "dist/humanup-agents-$VERSION.tar.gz" -C build humanup-agents
rm -rf build
echo "dist/humanup-agents-$VERSION.tar.gz"
