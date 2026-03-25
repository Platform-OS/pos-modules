set -eu

DEFAULT_ENV=""
POS_ENV="${1:-$DEFAULT_ENV}"

npm run test:setup:local

echo "DEBUG: MPKIT_URL=${MPKIT_URL:-not set}"
echo "DEBUG: MPKIT_TOKEN=${MPKIT_TOKEN:-not set}"
echo "DEBUG: POS_ENV=${POS_ENV:-empty}"

pos-cli data clean $POS_ENV --auto-confirm --include-schema

cd ./tests/post_import
pos-cli deploy $POS_ENV
