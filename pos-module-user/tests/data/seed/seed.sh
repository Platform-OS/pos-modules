set -eu

DEFAULT_ENV=""
POS_ENV="${1:-$DEFAULT_ENV}"

pos-cli modules install --dev

pos-cli data clean $POS_ENV --auto-confirm --include-schema
pos-cli deploy $POS_ENV
# the E2E mailbox (tests/pages/testMailBox.ts) reads /_tests/sent_mails without signing in
pos-cli constants set --name modules/tests/SENT_MAILS_PUBLIC --value true $POS_ENV

cd ./tests/post_import
env CONFIG_FILE_PATH=./../../.pos pos-cli data import --path=./../data/seed/data.zip --zip $POS_ENV
env CONFIG_FILE_PATH=./../../.pos pos-cli deploy -p $POS_ENV
