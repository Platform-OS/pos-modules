set -eu

# Usage: ./tests/data/seed/seed.sh [env] [--keep-data]
#   CI:        ./tests/data/seed/seed.sh            (env comes from MPKIT_* variables)
#   Our dev:   ./tests/data/seed/seed.sh support-dev --keep-data
# --keep-data skips `pos-cli data clean`, so tickets created while testing survive.

POS_ENV="${1:-}"
KEEP_DATA="${2:-}"

pos-cli modules install --dev

if [ "$KEEP_DATA" != "--keep-data" ]; then
  pos-cli data clean $POS_ENV --auto-confirm --include-schema
fi
pos-cli deploy $POS_ENV

# A fresh CI instance has none of the secrets the install generator sets.
# Throwaway values: the tests send email only to the example app's stub.
if [ "${CI:-}" = "true" ] && [ -z "$POS_ENV" ]; then
  pos-cli constants set --name modules/support/EMAIL_API_KEY --value "ci-stub-key"
  for name in INBOUND_SECRET EVENTS_SECRET REPLY_TOKEN_SECRET; do
    pos-cli constants set --name "modules/support/$name" --value "$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  done
fi

if [ -f ./tests/data/seed/data.zip ]; then
  cd ./tests/post_import
  env CONFIG_FILE_PATH=./../../.pos pos-cli data import --path=./../data/seed/data.zip --zip $POS_ENV
  env CONFIG_FILE_PATH=./../../.pos pos-cli deploy -p $POS_ENV
  cd -
fi
