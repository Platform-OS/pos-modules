# pOS Captchas — hCaptcha provider

hCaptcha provider for the
[captchas](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-captchas)
abstraction module. Install it, point your keys at it, and the generic
`modules/captchas/widget` partial and `modules/captchas/commands/captcha/verify` command
work with hCaptcha — no other code changes.

Provider key: **`hcaptcha`** (machine name `captchas_hcaptcha`).

## Install

```bash
pos-cli modules install captchas_hcaptcha
```

This also installs the `captchas` dependency. `pos-cli deploy <env>` afterwards.

## Keys

Create a site in the [hCaptcha dashboard](https://dashboard.hcaptcha.com/). **Best
practice**: store the pair in the abstraction's default constants, so the generic
widget/verify calls need neither `provider:`, `site_key:`, nor `secret:` at any call site:

```bash
pos-cli constants set <env> --name CAPTCHA_DEFAULT_PROVIDER --value "hcaptcha"
pos-cli constants set <env> --name CAPTCHA_DEFAULT_SITE_KEY --value "10000000-..."
pos-cli constants set <env> --name CAPTCHA_DEFAULT_SECRET --value "0x0000..."
```

The site key is public (rendered client-side); the secret is server-side only — never output
it in HTML. Keys are always passed by the caller (or resolved from the defaults above), so
multiple sitekeys per instance are just another pair of constants, passed explicitly at that
call site instead of relying on the default.

## Usage

```liquid
{# in your form #}
{% render 'modules/captchas/widget' %}

{# in your POST handler #}
{% function result = 'modules/captchas/commands/captcha/verify',
     expected_sitekey: context.constants.CAPTCHA_DEFAULT_SITE_KEY %}
{% if result.valid %}...{% endif %}
```

> ⚠️ **Pass `expected_sitekey`.** hCaptcha secrets are **account-wide**: a token solved
> against any widget of your account verifies against your secret, so a token issued for one
> form could be redeemed on another. `expected_sitekey` is forwarded as hCaptcha's `sitekey`
> siteverify param (which hCaptcha itself recommends) so such tokens are rejected. Always set
> it — even with a single default site key — since it costs nothing and future-proofs against
> a second sitekey being added later.

Pass `provider:`, `site_key:`, and/or `secret:` explicitly only when a call site needs to
deviate from the instance default (see [Keys](#keys)):

```liquid
{% render 'modules/captchas/widget',
     provider: 'hcaptcha',
     site_key: context.constants.CAPTCHA_HCAPTCHA_MKTG_SITE_KEY %}

{% function result = 'modules/captchas/commands/captcha/verify',
     provider: 'hcaptcha',
     secret: context.constants.CAPTCHA_HCAPTCHA_MKTG_SECRET,
     expected_sitekey: context.constants.CAPTCHA_HCAPTCHA_MKTG_SITE_KEY %}
```

The token is read automatically from `h-captcha-response` in `context.params`.

## Widget options

Pass as the `options:` hash (build it with `parse_json`/`hash_merge` — inline hash literals
are nil at runtime):

| Key | Values |
|---|---|
| `theme` | `light` / `dark` |
| `size` | `normal` / `compact` |
| `tabindex` | tab index |
| `callback` | JS function name called with the token |
| `expired_callback` / `chalexpired_callback` / `error_callback` / `open_callback` / `close_callback` | JS function names for widget events |
| `language` | `hl` script param (applied on first load) |
| `class_name` | extra CSS classes on the widget div |
| `html_id` | `id` attribute on the widget div |

The loader script (`https://js.hcaptcha.com/1/api.js`) is emitted once per page, guarded via
`context.exports.captcha.hcaptcha_script_loaded`.

## Verification

`verify` POSTs to `https://api.hcaptcha.com/siteverify` (`application/x-www-form-urlencoded` —
hCaptcha does not accept JSON) and fails closed on transport errors, non-200 responses, and
non-JSON bodies (`modules/captchas/errors.request_failed`). A `success: false` answer maps to
`modules/captchas/errors.verification_failed`. `expected_hostname` (handled by the
abstraction) works with the `hostname` field hCaptcha returns.

> ⚠️ **Billing** — the server-side verify call is a normal, billable platformOS API call;
> each `verify` performs one outbound `siteverify` request.

## Testing

hCaptcha publishes test keys that work without a real account. The test widget always
passes and yields a fixed dummy token:

| What | Value |
|---|---|
| Site key | `10000000-ffff-ffff-ffff-000000000001` |
| Secret | `0x0000000000000000000000000000000000000000` |
| Token the test widget yields | `10000000-aaaa-bbbb-cccc-000000000001` |

This repo's example app (`app/`, not distributed) uses them: deploy to a staging instance
that has the `captchas` and `tests` modules deployed, open `/demo`, submit, and see the
normalized result. `pos-cli test run <env>` runs the unit tests in `app/lib/test/` —
note `verify_test` performs real (billable) siteverify calls.
