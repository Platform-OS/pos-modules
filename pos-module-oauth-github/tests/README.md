# GitHub OAuth Module Tests

These tests are a minimal smoke suite for the provider-helper surface exposed by `pos-module-oauth-github`.

This module does not provide a full OAuth callback route, user creation flow, session flow, or public API endpoint. Its useful module surface is made of Liquid helpers and commands that a host OAuth implementation is expected to call.

## What Is Tested

The suite uses Playwright API requests against test-only platformOS pages under `tests/post_import`.

Those pages are thin harnesses that invoke the real module helpers:

- `modules/oauth_github/helpers/get_redirect_url`
- `modules/oauth_github/helpers/get_user_info`

The current tests verify two narrow contracts:

- `get_redirect_url` builds a parseable GitHub authorization URL containing the expected GitHub origin, authorize path, `client_id`, `state`, and `scope=user:email`.
- the test app returns `{ "valid": false }` when required callback input for `get_user_info` is missing, without driving into downstream token exchange.

The redirect URL test is intentionally shallow. It mostly protects helper wiring, query parameter propagation, and the public URL contract. It does not provide deep behavioral confidence.

The `get_user_info` missing-input test is a test-app guard, not a module behavior assertion. It exists to keep the harness endpoint stable in CI and to document that missing callback input is outside this module's tested behavior. It intentionally avoids the token command and outbound GitHub call so CI does not depend on GitHub availability, platformOS external API call behavior, or core validation partial deployment.

## What Is Not Tested

These tests do not prove a complete OAuth login works.

They intentionally do not cover:

- browser login through GitHub
- real GitHub callback handling
- successful access token exchange
- module-level missing-code handling in `get_user_info`
- downstream token command validation
- GitHub error responses for invalid OAuth codes
- successful GitHub user normalization
- fallback lookup through `/user/emails` for private primary email addresses
- host-app user creation or login
- session state changes
- configured platformOS constants such as `OAUTH2_GITHUB_CLIENT_ID`

Testing those outcomes would require either a host app that owns the OAuth callback/session behavior or dedicated GitHub credentials and a stable test user. That would be a different, broader integration suite.

## Why Test Harness Pages Exist

Playwright cannot call platformOS Liquid functions directly. The test-only pages expose a minimal HTTP surface so the tests can invoke the module helpers inside platformOS.

The harness pages should stay thin. They should pass request parameters into the real module helpers and return the helper result as JSON. Business logic belongs in the module, not in the harness.

## Running

Deploy the test harness, then run:

```sh
MPKIT_URL=https://your-instance.example.com npm run api-tests
```

The seed script deploys the module and then deploys `tests/post_import`, which contains the harness pages.

```sh
sh tests/data/seed/seed.sh dev
```
