# pOS Captchas — Google reCAPTCHA v2 provider

Google reCAPTCHA v2 (checkbox / invisible) provider for the
[captchas](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-captchas)
abstraction module. Install it, point your keys at it, and the generic
`modules/captchas/widget` partial and `modules/captchas/commands/captcha/verify` command
work with reCAPTCHA v2 — no other code changes.

Provider key: **`recaptcha`** (machine name `captchas_recaptcha`). For the score-based,
invisible reCAPTCHA **v3**, use the separate `captchas_recaptcha3` module.

> ⚠️ **Do not mix v2 and v3 widgets on one page** — both use Google's `api.js` loader,
> which cannot be loaded twice with different parameters.

## Install

```bash
pos-cli modules install captchas_recaptcha
```

This also installs the `captchas` dependency. `pos-cli deploy <env>` afterwards.

## Keys

Register a **v2** site in the [reCAPTCHA admin console](https://www.google.com/recaptcha/admin)
(your own Google account) and store the pair in constants:

```bash
pos-cli constants set <env> --name CAPTCHA_RECAPTCHA_SITE_KEY --value "6Le..."
pos-cli constants set <env> --name CAPTCHA_RECAPTCHA_SECRET --value "6Le..."
```

The site key is public (rendered client-side); the secret is server-side only — never output
it in HTML. The constant names are a convention: keys are always passed by the caller, so
multiple key pairs per instance are just more constants.

## Usage

```liquid
{# in your form #}
{% render 'modules/captchas/widget',
     provider: 'recaptcha',
     site_key: context.constants.CAPTCHA_RECAPTCHA_SITE_KEY %}

{# in your POST handler #}
{% function result = 'modules/captchas/commands/captcha/verify',
     provider: 'recaptcha',
     secret: context.constants.CAPTCHA_RECAPTCHA_SECRET %}
{% if result.valid %}...{% endif %}
```

Set `CAPTCHA_DEFAULT_PROVIDER=recaptcha` to omit the `provider:` argument. The token is read
automatically from `g-recaptcha-response` in `context.params`.

## Widget options

Pass as the `options:` hash (build it with `parse_json`/`hash_merge` — inline hash literals
are nil at runtime):

| Key | Values |
|---|---|
| `theme` | `light` / `dark` |
| `size` | `normal` / `compact` / `invisible` |
| `tabindex` | tab index |
| `callback` | JS function name called with the token |
| `expired_callback` / `error_callback` | JS function names for widget events |
| `badge` | `bottomright` / `bottomleft` / `inline` (invisible only) |
| `language` | `hl` script param (applied on first load) |
| `class_name` | extra CSS classes on the widget div |
| `html_id` | `id` attribute on the widget div |

> ⚠️ **`size: invisible` needs your own JS wiring.** The partial renders the widget element
> but does not auto-execute it: call `grecaptcha.execute()` on submit (or bind the widget to
> your submit button per Google's invisible reCAPTCHA docs) and handle the token via
> `callback`. Without that wiring the form submits token-less and verification fails with
> `token_missing`. For an invisible flow with no custom JS, use the `recaptcha3` or
> `turnstile` provider.

The loader script (`https://www.google.com/recaptcha/api.js`) is emitted once per page,
guarded via `context.exports.captcha.recaptcha_script_loaded`.

## Verification

`verify` POSTs to `https://www.google.com/recaptcha/api/siteverify`
(`application/x-www-form-urlencoded`) and fails closed on transport errors, non-200
responses, and non-JSON bodies (`modules/captchas/errors.request_failed`). A
`success: false` answer maps to `modules/captchas/errors.verification_failed`.
`expected_hostname` (handled by the abstraction) works with the `hostname` field
reCAPTCHA returns.

> ⚠️ **Billing** — the server-side verify call is a normal, billable platformOS API call;
> each `verify` performs one outbound `siteverify` request.

## Testing

Google publishes automated-testing keys that always pass (the widget shows a warning
banner):

| What | Value |
|---|---|
| Site key | `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI` |
| Secret | `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe` |

This repo's example app (`app/`, not distributed) uses them: deploy to a staging instance
that has the `captchas` and `tests` modules deployed, open `/demo`, submit, and see the
normalized result. `pos-cli test run <env>` runs the unit tests in `app/lib/test/` —
note `verify_test` performs real (billable) siteverify calls against the test keys.
