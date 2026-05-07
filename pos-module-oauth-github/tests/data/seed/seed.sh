set -eu

DEFAULT_ENV=""
POS_ENV="${1:-$DEFAULT_ENV}"

mkdir -p app/

pos-cli data clean $POS_ENV --auto-confirm --include-schema
pos-cli modules install core
pos-cli deploy $POS_ENV

cd ./tests/post_import
env CONFIG_FILE_PATH=./../../.pos pos-cli deploy -p $POS_ENV
