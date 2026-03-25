set -eu

DEFAULT_ENV=""
POS_ENV="${1:-$DEFAULT_ENV}"

npm run test:setup:local

pos-cli data clean $POS_ENV --auto-confirm --include-schema

cd ./tests/post_import
env CONFIG_FILE_PATH=./../../.pos pos-cli deploy $POS_ENV
