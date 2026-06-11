# Payments Module Tests

These tests are a small Playwright API suite for the transaction lifecycle behavior exposed by `pos-module-payments`.

This module does not expose public JSON API routes. The tests use test-only platformOS pages under `tests/post_import` as a thin harness for invoking real module commands.

## What Is Tested

The tests call real payments commands through test-only pages.

They verify:

- a valid transaction is persisted with the expected fields
- a new transaction starts with `app.statuses.transactions.new`
- updating to `pending` updates the transaction cache and creates a status record
- repeating the same `pending` update does not create another status record
- `succeeded` maps to `app.statuses.transactions.succeeded`
- invalid transaction creation returns validation errors without creating a record
- `expired` maps to `app.statuses.transactions.expired`
- unknown payment statuses map to `app.statuses.transactions.failed`
- received gateway requests persist request metadata, payload, gateway object ID, and `stripe_account_name`

Terminal status mappings are tested on separate transactions. The module also updates the cached `c__status` from `status_created` consumers, so tests avoid chaining multiple terminal transitions on one transaction in a single request.

## What Is Not Tested

These tests do not cover:

- real payment gateway integrations
- external API calls
- browser payment flows
- gateway-specific `pay_url` or `pay_object` helpers
- webhook handlers from gateway modules
- every gateway request logging branch

Those behaviors belong either in gateway module tests or in additional focused payments module tests.

## Running

Deploy the test harness, then run:

```sh
MPKIT_URL=https://your-instance.example.com npm run api-tests
```

The seed script creates the root `app/` directory before installing `core`, cleans the instance, installs `core`, deploys the module, and finally deploys `tests/post_import`, which contains the harness pages.

```sh
sh tests/data/seed/seed.sh dev
```
