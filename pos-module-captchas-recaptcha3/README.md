# pOS Captchas — Google reCAPTCHA v3 provider

Google reCAPTCHA v3 (invisible, score-based) provider for the
[captchas](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-captchas)
abstraction module. Install it, point your keys at it, and the generic
`modules/captchas/widget` partial and `modules/captchas/commands/captcha/verify` command
work with reCAPTCHA v3 — no other code changes.

Provider key: **`recaptcha3`** (machine name `captchas_recaptcha3`).

> **Renamed from `recaptcha_v3`.** If you used the pre-split captchas module, update
> `provider: 'recaptcha_v3'` arguments and `CAPTCHA_DEFAULT_PROVIDER` values to `recaptcha3`.

> ⚠️ **Do not mix v2 and v3 widgets on one page** — both use Google's `api.js` loader,
> which cannot be loaded twice with different parameters. reCAPTCHA v2 is the separate
> `captchas_recaptcha` module.

## Install

```bash
pos-cli modules install captchas_recaptcha3
```

This also installs the `captchas` dependency. `pos-cli deploy <env>` afterwards.

## Keys

Register a **v3** site in the [reCAPTCHA admin console](https://www.google.com/recaptcha/admin)
(your own Google account; v3 has **no public test keys** and keys are tied to your domain).
**Best practice**: store the pair in the abstraction's default constants, so the generic
widget/verify calls need neither `provider:`, `site_key:`, nor `secret:` at any call site:

```bash
pos-cli constants set <env> --name CAPTCHA_DEFAULT_PROVIDER --value "recaptcha3"
pos-cli constants set <env> --name CAPTCHA_DEFAULT_SITE_KEY --value "6Le..."
pos-cli constants set <env> --name CAPTCHA_DEFAULT_SECRET --value "6Le..."
```

The site key is public (rendered client-side); the secret is server-side only — never output
it in HTML. Keys are always passed by the caller (or resolved from the defaults above), so a
second key pair on the same instance is just another pair of constants, passed explicitly at
that call site instead of relying on the default.

## Usage

```liquid
{# in your form — invisible: wires the form's submit, no visible widget #}
{% parse_json widget_options %}{ "action": "signup_submit" }{% endparse_json %}
{% render 'modules/captchas/widget', options: widget_options %}

{# in your POST handler #}
{% function result = 'modules/captchas/commands/captcha/verify',
     min_score: 0.5,
     expected_action: 'signup_submit' %}
{% if result.valid %}...{% endif %}
```

Pass `provider:`, `site_key:`, and/or `secret:` explicitly only when a call site needs to
deviate from the instance default (see [Keys](#keys)):

```liquid
{% render 'modules/captchas/widget',
     provider: 'recaptcha3',
     site_key: context.constants.CAPTCHA_RECAPTCHA3_MKTG_SITE_KEY,
     options: widget_options %}

{% function result = 'modules/captchas/commands/captcha/verify',
     provider: 'recaptcha3',
     secret: context.constants.CAPTCHA_RECAPTCHA3_MKTG_SECRET,
     min_score: 0.5,
     expected_action: 'signup_submit' %}
```

v3 is **score-based**: every verification returns a score (`0.0` = likely bot, `1.0` =
likely human) instead of a binary verdict. `verify` passes only when the provider reports
success, `result.score >= min_score` (default `0.5`), and — when `expected_action` is set —
the response action matches. `result.score` and `result.action` are returned for logging or
custom thresholds.

## Widget options

| Key | Meaning |
|---|---|
| `action` | v3 action name (default `submit`); pair it with verify's `expected_action` |
| `response_field_name` | hidden input name (default `g-recaptcha-response`) |

The widget renders no visible element. It wires the enclosing `<form>`: on submit it runs
`grecaptcha.execute()`, injects the token into a hidden input, and resubmits. Render at most
one v3 widget per form (duplicates are detected and ignored with a console warning). If the
challenge fails client-side, the form submits token-less and verify fails closed.

## Verification

`verify` POSTs to `https://www.google.com/recaptcha/api/siteverify`
(`application/x-www-form-urlencoded`), fails closed on transport errors, non-200 responses,
and non-JSON bodies (`modules/captchas/errors.request_failed`), then applies the score/action
gate (`modules/captchas_recaptcha3/helpers/score_check`):

| Outcome | Error key |
|---|---|
| provider `success` false/missing | `modules/captchas/errors.verification_failed` |
| action ≠ `expected_action` | `modules/captchas/errors.action_mismatch` |
| score < `min_score` | `modules/captchas/errors.low_score` |

`expected_hostname` (handled by the abstraction) works with the `hostname` field the
response includes.

> ⚠️ **Billing** — the server-side verify call is a normal, billable platformOS API call;
> each `verify` performs one outbound `siteverify` request.

## Troubleshooting

**Every verification fails with `error-codes: ["browser-error"]`** in `result.response` —
the token was minted (your key pair is valid) but Google rejected the browser-side
assessment. By far the most common cause: **the page's domain is not in the site key's
allowed domains**. v3 has no visible widget to surface "Invalid domain for site key" — the
badge in the page's bottom-right corner shows it, but `grecaptcha.execute()` still yields a
token that `siteverify` then rejects. Add the domain in the
[admin console](https://www.google.com/recaptcha/admin) (a registered domain covers all its
subdomains). If the key was created in the Google Cloud console (Enterprise-style), the
domain list lives there instead, and classic `siteverify` needs that key's *legacy secret
key* — creating a classic v3 key is simpler. Sporadic (not every-request) `browser-error`
usually means the visitor's browser blocked reCAPTCHA (ad blocker, firewall).

## Testing

v3 has no public test keys, so the network path needs real keys (the example app in `app/`
reads `CAPTCHA_RECAPTCHA3_SITE_KEY` / `CAPTCHA_RECAPTCHA3_SECRET` and shows setup
instructions when they are unset — open `/demo` after deploying to a staging instance that
has the `captchas` and `tests` modules deployed). The score/action gate is covered by
deterministic unit tests (`app/lib/test/captchas_recaptcha3/score_check_test.liquid`,
run with `pos-cli test run <env>`) that need no network.
