#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "No .env file found; starting in Demo Bank mode."
fi
echo "Starting ScoreForge 130+. The server will display the configured local address."
exec node server.mjs
