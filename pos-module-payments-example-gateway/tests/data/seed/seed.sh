set -eu

DEFAULT_ENV=""
POS_ENV="${1:-$DEFAULT_ENV}"

pos-cli data clean $POS_ENV --auto-confirm --include-schema

cd ./tests/post_import
env CONFIG_FILE_PATH=./../../.pos pos-cli deploy $POS_ENV
