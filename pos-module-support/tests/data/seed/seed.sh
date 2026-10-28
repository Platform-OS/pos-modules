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

if [ -f ./tests/data/seed/data.zip ]; then
  cd ./tests/post_import
  env CONFIG_FILE_PATH=./../../.pos pos-cli data import --path=./../data/seed/data.zip --zip $POS_ENV
  env CONFIG_FILE_PATH=./../../.pos pos-cli deploy -p $POS_ENV
  cd -
fi
