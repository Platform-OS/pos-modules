set -eu

# CI only: Playwright smoke run on the fresh CI instance (MPKIT_* set by the
# workflow). Creates throwaway admin and agent users, then runs
# tests/e2e/00-smoke.spec.ts. The inbound secret is the one seed.sh set.

rand() { od -An -N12 -tx1 /dev/urandom | tr -d ' \n'; }

export E2E_ENV=ci
export E2E_INBOUND_SECRET="$(cat ./tests/e2e/.ci-inbound-secret)"
export E2E_USERS_FILE=./tests/e2e/.ci-users
: > "$E2E_USERS_FILE"

for role in superadmin agent; do
  email="ci-$role-$(rand)@e2e.example"
  password="$(rand)"
  code="$(sed -e "s/__EMAIL__/$email/" -e "s/__PASSWORD__/$password/" -e "s/__ROLE__/$role/" ./tests/e2e/liquid/ci_user.liquid)"
  pos-cli exec liquid "$E2E_ENV" "$code" > /dev/null
  echo "$email $password $role" >> "$E2E_USERS_FILE"
done

npx playwright test tests/e2e/00-smoke.spec.ts --project=test --reporter=list --retries=1
