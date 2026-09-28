#!/bin/sh
# Static gates for pos-module-mcp (no instance, no secrets). Run from the module root.
set -eu

# The engine (Layer 1) is standalone — it references NO other module.
offenders=$(grep -rhoE "modules/[a-z0-9_]+" modules/mcp/public/ | sort -u | grep -vx "modules/mcp" || true)
if [ -n "$offenders" ]; then
  echo "engine references non-mcp modules — the standalone guarantee is broken:"
  echo "$offenders"
  exit 1
fi
echo "engine references only modules/mcp ✓"

# Every harness/suite parses.
find tests -name '*.mjs' -exec node --check {} \;
echo "harnesses parse ✓"

# The generated seed migration must be byte-identical to the committed one.
node tests/seed/generate_migrations.mjs
if ! git diff --quiet -- app/migrations; then
  echo "seed migration out of date — run: npm run seed:generate"
  git --no-pager diff -- app/migrations
  exit 1
fi
echo "seed migration up-to-date ✓"

# Author-boundary security gate for every tool's manifest, handler and query.
node tests/lib/lint-tools.mjs --strict
