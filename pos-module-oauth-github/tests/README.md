# GitHub OAuth Module Tests

These tests cover the provider-helper surface exposed by `pos-module-oauth-github`.

This module does not provide a full OAuth callback route, user creation flow, session flow, or public API endpoint. Its useful module surface is made of Liquid helpers and commands that a host OAuth implementation is expected to call.

## What Is Tested

The suite uses Playwright API requests against test-only platformOS pages under `tests/post_import`.

Those pages are thin harnesses that invoke the real module helpers:

- `modules/oauth_github/helpers/get_redirect_url`
- `modules/oauth_github/helpers/get_user_info`

The current tests verify:

- `get_redirect_url` builds a GitHub authorization URL containing the expected GitHub origin, authorize path, `client_id`, `state`, and `scope=user:email`.
- `get_user_info` returns `{ "valid": false }` when GitHub token exchange fails for an invalid OAuth code.

The `get_user_info` test exercises more of the module than a direct GitHub smoke test: it goes through the module helper, token command, token request builder/validator, and the module GraphQL wrapper for GitHub's token endpoint.

## What Is Not Tested

These tests do not prove a complete OAuth login works.

They intentionally do not cover:

- browser login through GitHub
- real GitHub callback handling
- successful access token exchange
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

