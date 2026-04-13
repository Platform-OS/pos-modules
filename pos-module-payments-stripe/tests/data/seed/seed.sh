set -eu

DEFAULT_ENV=""
POS_ENV="${1:-$DEFAULT_ENV}"

mkdir -p app/
# This also installs core module
pos-cli modules install payments

pos-cli data clean $POS_ENV --auto-confirm --include-schema
pos-cli deploy $POS_ENV
pos-cli constants set  --name stripe_sk_key --value $STRIPE_SK_KEY $POS_ENV
