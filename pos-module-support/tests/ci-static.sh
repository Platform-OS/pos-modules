#!/bin/sh
# Static gate for pos-module-support (tech-spec 09 §2, D-23). Fails the build when:
#   1. a desk page lacks `metadata.permission` or the `require_member` gate;
#   2. module code references a module outside the allowed set;
#   3. a POST page under support-desk does not check context.csrf_request_valid.
set -eu

cd "$(dirname "$0")/.."
ROOT=modules/support/public
FAIL=0

# 1. Every desk page declares a permission and passes the membership gate.
if [ -d "$ROOT/views/pages/support-desk" ]; then
  for f in $(find "$ROOT/views/pages/support-desk" -name '*.liquid'); do
    case "$f" in
      */sign-in*.liquid|*/password*.liquid|*/password/*|*/join*.liquid|*/join/*|*/invites/*|*/manifest.liquid|*/sw.liquid|*/request-access.liquid) continue ;;
    esac
    if ! grep -q 'permission:' "$f"; then
      echo "ci-static: $f has no metadata.permission"; FAIL=1
    fi
    if ! grep -q "modules/support/helpers/require_member" "$f"; then
      echo "ci-static: $f does not call modules/support/helpers/require_member"; FAIL=1
    fi
  done
fi

# 2. Module boundary: only these modules may be referenced from module code.
ALLOWED='support|core|user|common-styling|push_notifications|tests'
BAD=$(grep -rhoE "['\"]modules/[a-z_-]+/" "$ROOT" 2>/dev/null \
  | sed -E "s/['\"]modules\/([a-z_-]+)\//\1/" | sort -u | grep -vE "^($ALLOWED)$" || true)
if [ -n "$BAD" ]; then
  echo "ci-static: references to modules outside the allowed set: $BAD"; FAIL=1
fi

# 3. CSRF on every POST page under support-desk.
if [ -d "$ROOT/views/pages/support-desk" ]; then
  for f in $(grep -rlE '^method: post' "$ROOT/views/pages/support-desk" 2>/dev/null || true); do
    if ! grep -q 'csrf_request_valid' "$f"; then
      echo "ci-static: $f is a POST page without a context.csrf_request_valid check"; FAIL=1
    fi
  done
fi

# 4. Hex colours only in --pos-support-* token definitions (08 §2, WL-1).
CSS="$ROOT/assets/style/pos-support.css"
if [ -f "$CSS" ]; then
  HEX=$(grep -nE '#[0-9a-fA-F]{3,8}\b' "$CSS" | grep -vE '^[0-9]+:\s*--pos-support-[a-z0-9-]+:' || true)
  if [ -n "$HEX" ]; then
    echo "ci-static: hex colours outside the semantic tokens in pos-support.css:"; echo "$HEX"; FAIL=1
  fi
fi

# 5. Layering: pages read data through lib/queries, not GraphQL; partials only
#    render (formatting helpers are fine). Channel partials are platformOS
#    WebSocket handlers that check access themselves, so they may query.
PAGE_GQL=$(grep -rlE '^\s*graphql [a-z_]+ = |\{%-? *graphql ' "$ROOT/views/pages" 2>/dev/null || true)
if [ -n "$PAGE_GQL" ]; then
  echo "ci-static: pages running GraphQL directly (use a lib/queries wrapper):"; echo "$PAGE_GQL"; FAIL=1
fi
PARTIAL_DATA=$(grep -rlE "function [a-z_]+ = 'modules/support/(queries|commands)/|^\s*graphql " "$ROOT/views/partials" 2>/dev/null | grep -v '/views/partials/channels/' || true)
if [ -n "$PARTIAL_DATA" ]; then
  echo "ci-static: partials calling queries, commands or GraphQL (pass the data in):"; echo "$PARTIAL_DATA"; FAIL=1
fi
# ...and the helpers partials call must not read or write data either, except
# these (CLAUDE.md "Layering"): member_roles (one memoised read per request),
# brand_shift (lazy colour cache, at most 10 entries), settings (memoised),
# branding and status_icons (built from settings), department_color/palette.
ALLOWED_HELPERS='member_roles|brand_shift|settings|branding|status_icons|department_color|department_palette|next_department_color'
for helper in $(grep -rhoE "'modules/support/helpers/[a-z_/]+'" "$ROOT/views/partials" 2>/dev/null | tr -d "'" | sed 's#modules/support/helpers/##' | sort -u); do
  case "$helper" in */*) continue ;; esac
  if echo "$helper" | grep -qxE "$ALLOWED_HELPERS"; then continue; fi
  file="$ROOT/lib/helpers/$helper.liquid"
  [ -f "$file" ] || continue
  if grep -qE "'modules/support/(queries|commands)/|^\s*graphql " "$file"; then
    echo "ci-static: helpers/$helper is called from a partial but reads or writes data"; FAIL=1
  fi
done

# 5b. Pages do not loop. A page is a controller: it guards, reads through a
#     query, calls a command and hands the result to a partial. Iteration is
#     either shaping data (a query's job) or rendering (a partial's job), and a
#     page that loops is carrying logic nothing can unit-test. The gates above
#     only check WHERE code sits, not how much work it does.
#     The two pages listed predate the rule; shrink the list, never add to it.
PAGE_LOOP_DEBT='tickets/bulk.liquid|tickets/messages/create.liquid'
for f in $(find "$ROOT/views/pages" -name '*.liquid'); do
  if echo "$f" | grep -qE "$PAGE_LOOP_DEBT"; then continue; fi
  if grep -qE '^[[:space:]]*(\{%-?[[:space:]]*)?for ' "$f"; then
    echo "ci-static: $f loops — shape the data in a lib/queries wrapper, or iterate in the partial"; FAIL=1
  fi
done

# 6. Every webhook (pages under api/) authenticates by its secret path segment.
for f in $(find "$ROOT/views/pages/api" -name '*.liquid' 2>/dev/null); do
  if ! grep -q 'context.params.secret' "$f"; then
    echo "ci-static: $f is a webhook that does not check context.params.secret"; FAIL=1
  fi
done

# 7. Translation keys exist; events, hooks and settings keys are documented.
if ! node ./tests/check-docs.mjs; then
  FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
echo "ci-static: ok"
