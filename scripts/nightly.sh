#!/usr/bin/env bash
# vibecheck nightly canary: run the pack, refresh the public dashboard, push.
# Installed in cron as: 30 2 * * * .../scripts/nightly.sh >> .../canary.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:$PATH"

echo "=== vibecheck nightly $(date -u +%FT%TZ) ==="
node dist/cli.js run --repeats 3
node dist/cli.js render --out docs/index.html
node dist/cli.js report

if ! git diff --quiet docs/index.html; then
  git add docs/index.html
  git commit -m "Update dashboard"
  git push
fi
echo "=== done $(date -u +%FT%TZ) ==="
