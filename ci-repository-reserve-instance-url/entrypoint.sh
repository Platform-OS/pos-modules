#!/bin/sh -l

set -eu

METHOD=$1
CI_REPO_URL=${2}/api/instances
POS_CI_REPO_ACCESS_TOKEN=$3

GITHUB_REPOSITORY=${GITHUB_REPOSITORY:-octocat/Hello-World}
GITHUB_RUN_ID=${GITHUB_RUN_ID:-run-888}

CLIENT=${GITHUB_REPOSITORY}--${GITHUB_RUN_ID}--${GITHUB_RUN_NUMBER:-0}
CLIENT=${CLIENT/\//--}

request() {
  curl -s  -X$1 \
    -H "Authorization: Bearer $POS_CI_REPO_ACCESS_TOKEN" \
    -H 'Content-type: application/json' \
    -d "{\"client\":\"$CLIENT\"}" \
    --fail-with-body \
    ${CI_REPO_URL}/${2:-}
}

case $METHOD in

  release)
    echo releasing instance
    request DELETE release
    ;;

  get-token)
    set +e
    request POST get-token > .log
    RESCODE=$?
    set -e
    if [ $RESCODE != 0 ]; then
      echo "get-token request failed. [${RESCODE}]"
      cat .log
      exit 2137
    else
      MPKIT_TOKEN=$(cat .log)
    fi

    echo "::add-mask::$MPKIT_TOKEN"
    echo "mpkit-token=$MPKIT_TOKEN" >> $GITHUB_OUTPUT
    ;;

  reserve)
    set +e
    request POST reserve > .log
    RESCODE=$?
    set -e
    if [ $RESCODE != 0 ]; then
      echo "Reserve request failed. [${RESCODE}]"
      cat .log
      exit 2137
    else
      INSTANCE_DOMAIN=$(cat .log)
    fi

    echo "mpkit-url=https://$INSTANCE_DOMAIN" >> $GITHUB_OUTPUT
    echo "report-path=${INSTANCE_DOMAIN}/$(date +'%Y-%m-%d-%H-%M-%S')" >> $GITHUB_OUTPUT
    ;;

  test)
    request POST test
    ;;

  all)
    request POST
    ;;
  *)
    echo $METHOD command not found: Usage: ./scripts/ci/repository all | reserve | release
esac
