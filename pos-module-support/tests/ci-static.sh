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
      */sign-in.liquid|*/invites/*|*/manifest.liquid|*/sw.liquid) continue ;;
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

if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
echo "ci-static: ok"
