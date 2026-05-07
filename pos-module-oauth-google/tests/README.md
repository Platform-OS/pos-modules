# Google OAuth Module Tests

These tests are a minimal smoke suite for the provider-helper surface exposed by `pos-module-oauth-google`.

This module does not provide a full OAuth callback route, user creation flow, session flow, or public API endpoint. Its useful module surface is made of Liquid helpers and commands that a host OAuth implementation is expected to call.

## What Is Tested

The suite uses Playwright API requests against test-only platformOS pages under `tests/post_import`.

Those pages are thin harnesses that invoke the real module helpers:

- `modules/oauth_google/helpers/get_redirect_url`
- `modules/oauth_google/helpers/get_user_info`

The current tests verify two narrow contracts:

- `get_redirect_url` builds a parseable Google authorization URL containing the expected Google origin, authorize path, `client_id`, `state`, `scope`, `response_type=code`, and a `redirect_uri` ending in `/oauth/google/callback`.
- `get_user_info` returns `{ "valid": false }` when the OAuth callback code is missing.

The redirect URL test is intentionally shallow. It mostly protects helper wiring, query parameter propagation, and the public URL contract. It does not provide deep behavioral confidence.

The `get_user_info` missing-input test goes through the module helper and token command validation path. It intentionally avoids an outbound Google call so CI does not depend on Google availability or platformOS external API call behavior.

## What Is Not Tested

These tests do not prove a complete OAuth login works.

They intentionally do not cover:

- browser login through Google
- real Google callback handling
- successful access token exchange
- Google error responses for invalid OAuth codes
- successful Google user normalization
- host-app user creation or login
- session state changes
- configured platformOS constants such as `OAUTH2_GOOGLE_CLIENT_ID`

Testing those outcomes would require either a host app that owns the OAuth callback/session behavior or dedicated Google credentials and a stable test user. That would be a different, broader integration suite.

## Why Test Harness Pages Exist

Playwright cannot call platformOS Liquid functions directly. The test-only pages expose a minimal HTTP surface so the tests can invoke the module helpers inside platformOS.

The harness pages should stay thin. They should pass request parameters into the real module helpers and return the helper result as JSON. Business logic belongs in the module, not in the harness.

## Running

Deploy the test harness, then run:

```sh
MPKIT_URL=https://your-instance.example.com npm run api-tests
```

The seed script creates the root `app/` directory before installing `core`. This avoids the non-interactive CI prompt from `pos-cli modules install core` when the checkout does not already contain `app/`.

The seed script then cleans the instance, installs `core`, deploys the module, and finally deploys `tests/post_import`, which contains the harness pages.

```sh
sh tests/data/seed/seed.sh dev
```
