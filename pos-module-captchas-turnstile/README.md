# pOS Captchas — Cloudflare Turnstile provider

Cloudflare Turnstile provider for the
[captchas](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-captchas)
abstraction module. Install it, point your keys at it, and the generic
`modules/captchas/widget` partial and `modules/captchas/commands/captcha/verify` command
work with Turnstile — no other code changes.

Provider key: **`turnstile`** (machine name `captchas_turnstile`).

## Install

```bash
pos-cli modules install captchas_turnstile
```

This also installs the `captchas` dependency. `pos-cli deploy <env>` afterwards.

## Keys

Create a Turnstile widget in the [Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/turnstile)
(your own account — keys are per-customer, not platform-wide). **Best practice**: store them
in the abstraction's default constants, so the generic widget/verify calls need neither
`provider:`, `site_key:`, nor `secret:` at any call site:

```bash
pos-cli constants set <env> --name CAPTCHA_DEFAULT_PROVIDER --value "turnstile"
pos-cli constants set <env> --name CAPTCHA_DEFAULT_SITE_KEY --value "0x4AAA..."
pos-cli constants set <env> --name CAPTCHA_DEFAULT_SECRET --value "0x4AAA..."
```

The site key is public (rendered client-side); the secret is server-side only — never output
it in HTML. Keys are always passed by the caller (or resolved from the defaults above), so
multiple key pairs per instance (e.g. a separate marketing-site widget) are just another pair
of constants, passed explicitly at that call site instead of relying on the default
(`CAPTCHA_TURNSTILE_MKTG_SITE_KEY`, ...).

## Usage

```liquid
{# in your form #}
{% render 'modules/captchas/widget' %}

{# in your POST handler #}
{% function result = 'modules/captchas/commands/captcha/verify' %}
{% if result.valid %}...{% endif %}
```

Pass `provider:`, `site_key:`, and/or `secret:` explicitly only when a call site needs to
deviate from the instance default (see [Keys](#keys)):

```liquid
{% render 'modules/captchas/widget',
     provider: 'turnstile',
     site_key: context.constants.CAPTCHA_TURNSTILE_MKTG_SITE_KEY %}

{% function result = 'modules/captchas/commands/captcha/verify',
     provider: 'turnstile',
     secret: context.constants.CAPTCHA_TURNSTILE_MKTG_SECRET %}
```

The token is read automatically from `cf-turnstile-response` in `context.params`; if you
rename the widget's response field via its `response_field_name` option, pass the same value
to `verify` as `response_field_name:`.

## Widget options

Pass as the `options:` hash (build it with `parse_json`/`hash_merge` — inline hash literals
are nil at runtime):

| Key | Values |
|---|---|
| `theme` | `light` / `dark` / `auto` |
| `size` | `normal` / `flexible` / `compact` |
| `action` | widget action name (returned in the siteverify response) |
| `cdata` | customer data payload |
| `appearance` | `always` / `execute` / `interaction-only` |
| `language` | language code |
| `tabindex` | tab index |
| `callback` | JS function name called with the token |
| `response_field_name` | hidden input name (default `cf-turnstile-response`) |
| `class_name` | extra CSS classes on the widget div |
| `html_id` | `id` attribute on the widget div |

The loader script (`https://challenges.cloudflare.com/turnstile/v0/api.js`) is emitted once
per page, guarded via `context.exports.captcha.turnstile_script_loaded`.

## Verification

`verify` POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify` (JSON body:
`secret`, `response`, optional `remoteip`) and fails closed on transport errors, non-200
responses, and non-JSON bodies (`modules/captchas/errors.request_failed`). A `success: false`
answer maps to `modules/captchas/errors.verification_failed`. Turnstile secrets are
per-widget, so `expected_sitekey` is not needed; `expected_hostname` (handled by the
abstraction) works with the `hostname` field Turnstile returns.

> ⚠️ **Billing** — the server-side verify call is a normal, billable platformOS API call;
> each `verify` performs one outbound `siteverify` request.

## Testing

Cloudflare publishes dummy keys that work without a real account:

| Outcome         | Site key                     | Secret key                            |
|-----------------|------------------------------|---------------------------------------|
| always pass     | `1x00000000000000000000AA`   | `1x0000000000000000000000000000000AA` |
| always fail     | `2x00000000000000000000AB`   | `2x0000000000000000000000000000000AA` |
| force challenge | `3x00000000000000000000FF`   | (use a pass/fail secret)              |

This repo's example app (`app/`, not distributed) uses them: deploy to a staging instance
that has the `captchas` and `tests` modules deployed, open `/demo`, submit, and see the
normalized result. `pos-cli test run <env>` runs the unit tests in `app/lib/test/` —
note `verify_test` performs real (billable) siteverify calls against the test keys.
