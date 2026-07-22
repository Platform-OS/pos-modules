# pos-module-captchas

A generic, swappable **captcha abstraction** for platformOS. It does two jobs, the same way
for every provider:

1. **Render** the active provider's widget into a form — `modules/captchas/widget`.
2. **Verify** the token the widget injects on submit, by calling the provider's `siteverify`
   endpoint server-side and returning a **normalized pass/fail** —
   `modules/captchas/commands/captcha/verify`.

This module knows **nothing about any provider**. Each provider is a separate module named
`captchas_<key>` that this module dispatches to by naming convention — the same pattern the
[user module's oauth](https://github.com/Platform-OS/pos-module-user) uses for
`oauth_google`/`oauth_github`. Installing a provider module is all it takes to enable it;
adding a new provider requires no changes here (see
[Writing a provider module](#writing-a-provider-module)).

Official provider modules:

| Provider key | Module | Notes |
|---|---|---|
| `turnstile` | `captchas_turnstile` | Cloudflare Turnstile — passive/invisible, public test keys |
| `hcaptcha` | `captchas_hcaptcha` | hCaptcha — pass `expected_sitekey` (account-wide secrets) |
| `recaptcha` | `captchas_recaptcha` | Google reCAPTCHA v2 (checkbox / invisible) |
| `recaptcha3` | `captchas_recaptcha3` | Google reCAPTCHA v3 — invisible, score-based |

> None relies on the built-in platformOS `spam_protection` tag — every provider verifies
> through a plain server-side `siteverify` API call. The value of this module is one uniform,
> swappable interface, and support for providers the built-in tag doesn't cover (Turnstile).

## Install

Install one (or more) provider modules — each pulls in `captchas` as a dependency:

```bash
pos-cli modules install captchas_turnstile   # or captchas_hcaptcha / captchas_recaptcha / captchas_recaptcha3
pos-cli deploy <env>
```

## Keys are caller-supplied

The module **stores no keys**. You pass the **public site key** to the widget (rendered
client-side) and the **secret key** to `verify` (server-side only), typically read from
**platformOS constants**. For the common case of one widget/site per instance — **the best
practice** — set `CAPTCHA_DEFAULT_SITE_KEY` and `CAPTCHA_DEFAULT_SECRET` once (see [Site key
selection](#site-key-selection) and [Secret selection](#secret-selection)) and skip passing
`site_key`/`secret` at every call site. Don't invent a per-provider constant name
(`CAPTCHA_TURNSTILE_SITE_KEY` and friends) unless you actually need one — that naming exists
only for the **multiple keys on one instance** case, where extra forms pass their own key
explicitly instead of relying on the default:

```bash
pos-cli constants set <env> --name CAPTCHA_DEFAULT_SITE_KEY --value "0x4AAA..."
pos-cli constants set <env> --name CAPTCHA_DEFAULT_SECRET --value "0x4AAA..."

# A second widget/site on the same instance — an extra pair of constants, passed explicitly:
pos-cli constants set <env> --name CAPTCHA_TURNSTILE_MKTG_SITE_KEY --value "0x4AAA..."
pos-cli constants set <env> --name CAPTCHA_TURNSTILE_MKTG_SECRET --value "0x4AAA..."
```

Each provider module's README documents its constant-name convention and where to get keys.

> ⚠️ **Never hardcode a secret key** in templates or commit it. Site keys are public by
> design; secret keys are not. Don't `log` the secret or echo it into HTML.

## Usage

**Best practice**: set `CAPTCHA_DEFAULT_PROVIDER`, `CAPTCHA_DEFAULT_SITE_KEY`, and
`CAPTCHA_DEFAULT_SECRET` once per instance, then invoke the widget and `verify` with none of
`provider`, `site_key`, or `secret` — all three resolve from constants. No per-provider
constant name to invent, and swapping providers later is a constant change, not a template
change:

```bash
pos-cli constants set <env> --name CAPTCHA_DEFAULT_PROVIDER --value "turnstile"
pos-cli constants set <env> --name CAPTCHA_DEFAULT_SITE_KEY --value "0x4AAA..."
pos-cli constants set <env> --name CAPTCHA_DEFAULT_SECRET --value "0x4AAA..."
```

```liquid
{# 1. in your form #}
{% render 'modules/captchas/widget' %}

{# 2. in your POST handler #}
{% liquid
  function result = 'modules/captchas/commands/captcha/verify'
  if result.valid
    # proceed
  endif
%}
```

Pass `provider`, `site_key`, and/or `secret` explicitly only when a call site needs to
deviate from the instance default — e.g. a second widget on the same page using a different
provider or key (see [Keys are caller-supplied](#keys-are-caller-supplied)):

```liquid
{% render 'modules/captchas/widget',
     provider: 'turnstile',
     site_key: context.constants.CAPTCHA_TURNSTILE_MKTG_SITE_KEY %}

{% liquid
  function result = 'modules/captchas/commands/captcha/verify',
    provider: 'turnstile', secret: context.constants.CAPTCHA_TURNSTILE_MKTG_SECRET
%}
```

Render errors with `| t` — `result.errors` maps fields to arrays of translation keys:

```liquid
{% for error in result.errors %}
  {% for key in error[1] %}<p>{{ key | t }}</p>{% endfor %}
{% endfor %}
```

> 🔒 **Never choose the secret from client input.** Fix the provider server-side and read its
> secret from a constant. If an attacker controls which provider — and therefore which
> secret — verifies a request, they can steer verification to a weaker path.

### Provider selection

`provider` may be passed explicitly. If omitted, it resolves to the
`CAPTCHA_DEFAULT_PROVIDER` constant. There is no built-in fallback — with neither set, the
widget renders only an HTML comment and verify fails with `unsupported_provider`. Values are
normalized (trimmed, lowercased).

```bash
pos-cli constants set <env> --name CAPTCHA_DEFAULT_PROVIDER --value "turnstile"
```

### Site key selection

`site_key` (widget only) may be passed explicitly. If omitted, it resolves to the
`CAPTCHA_DEFAULT_SITE_KEY` constant. There is no built-in fallback — with neither set, the
widget logs an error and emits an HTML comment instead (see [the widget
reference](#partial-modulescaptchaswidget)). Only whitespace is trimmed — unlike the provider
key, site keys are case-sensitive.

```bash
pos-cli constants set <env> --name CAPTCHA_DEFAULT_SITE_KEY --value "0x4AAA..."
```

### Secret selection

`secret` (verify only) may be passed explicitly. If omitted, it resolves to the
`CAPTCHA_DEFAULT_SECRET` constant. There is no built-in fallback — with neither set, `verify`
fails closed with `secret_missing` (no network call). Only whitespace is trimmed — secrets
are case-sensitive.

```bash
pos-cli constants set <env> --name CAPTCHA_DEFAULT_SECRET --value "0x4AAA..."
```

A provider is **available** when its module (`captchas_<key>`) is installed — detected via
the `provider.name` translation every provider module ships. Optionally,
`CAPTCHA_ENABLED_PROVIDERS` (CSV, e.g. `turnstile,hcaptcha`) pins an allow-list: when set,
only listed keys dispatch, even if more provider modules are installed; when unset, any
installed provider works. An unavailable provider never hard-errors: the widget degrades to
a logged HTML comment, and verify returns `valid: false` with
`modules/captchas/errors.unsupported_provider`.

## API reference

### Partial: `modules/captchas/widget`

**Render this partial (don't `include` it)** — it pulls the provider widget in via
`include`, which shares scope; rendering the dispatcher keeps that contained.

| Param | Required | Description |
|---|---|---|
| `site_key` | no | The provider's public site key; defaults to `CAPTCHA_DEFAULT_SITE_KEY`. A blank result (neither passed nor set) logs an error + emits an HTML comment (the widget is still rendered and fails visibly client-side). |
| `provider` | no | Provider key; defaults to `CAPTCHA_DEFAULT_PROVIDER`. |
| `options` | no | Hash of provider-specific widget options — see the provider module's README. Build it with `parse_json`/`hash_merge`; inline hash literals are nil at runtime. |

### Command: `modules/captchas/commands/captcha/verify`

| Param | Required | Description |
|---|---|---|
| `provider` | no | Provider key; defaults to `CAPTCHA_DEFAULT_PROVIDER`. |
| `secret` | no | Provider secret key (server-side); defaults to `CAPTCHA_DEFAULT_SECRET`. A blank result (neither passed nor set) fails closed with `secret_missing`. |
| `token` | no | The widget token; defaults to the provider's response field in `context.params`. |
| `response_field_name` | no | Form field the widget wrote the token to; overrides the provider default (only needed if you set the widget's `response_field_name` option). |
| `remote_ip` | no | Optional visitor IP forwarded to the provider. |
| `expected_sitekey` | no | For providers whose secrets are account-wide rather than per-widget: the sitekey the token must have been issued for (see the provider README for whether it applies). |
| `expected_hostname` | no | Hostname allow-list (single host or CSV, e.g. `example.com,www.example.com`). The provider-reported hostname must match one exactly (case-insensitive) or verification fails. Defends against tokens solved on another domain. |
| `min_score` | no | Score-based providers only: minimum score required to pass (see the provider README for the default). |
| `expected_action` | no | Score-based providers only: required action name. |

Returns:

| Field | Description |
|---|---|
| `valid` | **The** result — `true` only after a successful, policy-passing verification. Branch on this. |
| `success` | The provider's raw verdict (before hostname/score/action checks). |
| `provider` | Resolved provider key. |
| `token_field` | The form field the token was read from. |
| `response` | Parsed provider response (hash). |
| `score` / `action` | Score-based providers only. |
| `errors` | Hash of field → array of translation keys (`modules/captchas/errors.*`). |

Error keys — all shipped by this module (en + pl), so callers deal with one namespace
regardless of provider: `token_missing`, `secret_missing`, `unsupported_provider`,
`request_failed`, `verification_failed`, `hostname_mismatch`, `low_score`, `action_mismatch`.

## How verification works

`verify` runs a Build → Check → Execute chain:

- **build** — resolves the provider; when it's available, asks the provider module's
  `helpers/config` for the default token field and reads the token from `context.params`.
- **check** — fails closed (no network call) when the token or secret is missing or the
  provider is unavailable.
- **execute** — re-checks availability (defense in depth: a missing provider module must
  yield a graceful error, never a hard one), dispatches to
  `modules/captchas_<key>/commands/verify` (one siteverify HTTP call), then applies the
  generic `expected_hostname` allow-list to the provider response.

Every failure path leaves `valid: false` — the module **fails closed**: no verification
call, no pass.

## ⚠️ Billing

The server-side verify call is a **normal, billable platformOS API call** — it is **not
exempt** from API usage billing. Each `verify` performs one outbound `siteverify` request.

## Writing a provider module

A provider is a separate platformOS module named `captchas_<key>` (`<key>`: lowercase
`a-z0-9_`), with `"dependencies": { "captchas": "^1.0.0" }`. The abstraction dispatches to
it purely by naming convention — no registration anywhere. It must expose:

1. **`modules/captchas_<key>/widget`** (`public/views/partials/widget.liquid`) — receives
   `site_key` (string) and `options` (hash). It is pulled in via `include` (shared scope):
   prefix internal variables (`captcha_...`) and use `context.exports.captcha.*` for
   load-once script guards (that namespace is reserved for captcha providers; pick a key
   unique to your provider, e.g. `myprovider_script_loaded`).
2. **`modules/captchas_<key>/helpers/config`** (`public/lib/helpers/config.liquid`) — a
   function returning a hash with at least `response_field`: the form field your widget
   writes the token into.
3. **`modules/captchas_<key>/commands/verify`** (`public/lib/commands/verify.liquid`) — a
   function taking `object:` and returning it with:
   - `response` — the parsed provider response (include `hostname` when your provider
     reports it, so `expected_hostname` works),
   - `success` — the provider's raw verdict,
   - `valid` — the final boolean; **fail closed** on transport errors, non-200 responses,
     non-JSON bodies, and a missing success field,
   - `errors` — merged via `modules/captchas/helpers/errors_hash`, using
     `modules/captchas/errors.*` keys (`request_failed`, `verification_failed`, and for
     score-based providers `low_score` / `action_mismatch`).

   The incoming `object` carries `secret`, `token`, `remote_ip`, `expected_sitekey`,
   `min_score`, `expected_action`, and the current `errors` — read what applies.
4. **`public/translations/en/provider.yml`** (and one per locale you support — at minimum
   also `pl/`) with `provider: { name: "..." }` — **required**: the abstraction probes
   `modules/captchas_<key>/provider.name` to detect that your module is installed.

Ship your own `api_calls/` template and `graphql/api_call/send.graphql` for the HTTP call —
providers are self-contained; any official provider module is a ready template. To activate:
install the module (and list `<key>` in `CAPTCHA_ENABLED_PROVIDERS` if you use the
allow-list).

## Testing

This repo's example app (`app/`, not distributed) contains the module's unit tests
(`app/lib/test/captcha/`) plus a **fake provider** (`app/modules/captchas_test/`) that
implements the contract deterministically without network — that's what the dispatch,
availability, fail-closed, and hostname tests run against, and what `/captcha-demo` demos.

```bash
pos-cli deploy <env>
pos-cli test run <env>
```

The suite assumes `CAPTCHA_DEFAULT_PROVIDER`, `CAPTCHA_DEFAULT_SITE_KEY`, and
`CAPTCHA_DEFAULT_SECRET` are unset, and `CAPTCHA_ENABLED_PROVIDERS` is unset (or contains
`test`), on the test instance. Provider-specific tests — real siteverify
round-trips against public test keys, score thresholds — live in each provider module's
repo.
