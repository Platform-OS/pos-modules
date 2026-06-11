#!/bin/bash
set -eu

DEFAULT_ENV=""
POS_ENV="${1:-$DEFAULT_ENV}"

mkdir -p app/
pos-cli modules install core

pos-cli data clean $POS_ENV --auto-confirm --include-schema

pos-cli deploy $POS_ENV
