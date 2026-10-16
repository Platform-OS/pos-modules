#!/bin/sh
# Static gates for pos-module-mcp (no instance, no secrets). Run from the module root.
set -eu

# The engine (Layer 1) references no business module — only itself, `core`
# (validations, command helpers) and `user` (accounts, sessions and RBAC).
offenders=$(grep -rhoE "modules/[a-z0-9_]+" modules/mcp/public/ | sort -u | grep -vxE "modules/(mcp|core|user)" || true)
if [ -n "$offenders" ]; then
  echo "engine references modules other than mcp/core/user:"
  echo "$offenders"
  exit 1
fi
echo "engine references only modules/mcp, modules/core and modules/user ✓"

# Every harness/suite parses.
find tests -name '*.mjs' -exec node --check {} \;
echo "harnesses parse ✓"

# The generated seed migration must be byte-identical to the committed one.
node tests/seed/generate_migrations.mjs --check

# Author-boundary security gate for every tool's manifest, handler and query.
node tests/lib/lint-tools.mjs --strict
