# pos-module-captchas

A generic, swappable **captcha abstraction** for platformOS, with **Cloudflare Turnstile**,
**hCaptcha**, **reCAPTCHA v2**, and **reCAPTCHA v3** provider implementations. It mirrors the
`payments` ⇄ `payments-stripe` split: a thin generic interface (`modules/captchas/...`) plus
per-provider implementations behind it, so you can "bolt in" or swap captcha providers in one place.

The module does two jobs:

1. **Render** the active provider's widget into a form (client-side loader script + widget element).
2. **Verify** the token the widget injects on submit, by calling the provider's `siteverify`
   endpoint server-side and returning a **normalized pass/fail** — regardless of provider.

> **Ships Turnstile, hCaptcha, reCAPTCHA v2, and reCAPTCHA v3.** All follow the same shape
> (see [Adding a provider](#adding-a-provider)). None relies on the built-in platformOS
> `spam_protection` tag — every provider is verified through a plain server-side `siteverify` API
> call, keeping the abstraction uniform (and covering Turnstile, which has no built-in tag).
> reCAPTCHA v2 and v3 are exposed as **separate providers** (`recaptcha` and `recaptcha_v3`): v2
> returns a binary pass/fail; v3 is invisible and score-based, so its verify additionally thresholds
> the returned score and can require a matching action.

## Keys are caller-supplied

The module **stores no keys**. You pass:

- the **public site key** to the widget (rendered client-side), and
- the **secret key** to `verify` (used server-side only).

Read both from wherever you keep them — typically **platformOS constants**. Because keys are
passed per call, supporting **multiple keys for the same provider on one instance** is trivial:
different forms simply pass different keys.

```bash
# Public site keys may be exposed to the browser; secret keys must stay server-side.
pos-cli constants set <env> CAPTCHA_TURNSTILE_SITE_KEY   "0x4AAA..."
pos-cli constants set <env> CAPTCHA_TURNSTILE_SECRET     "0x4AAA..."

# hCaptcha keys live in their own constants:
pos-cli constants set <env> CAPTCHA_HCAPTCHA_SITE_KEY    "10000000-ffff-..."
pos-cli constants set <env> CAPTCHA_HCAPTCHA_SECRET      "0x0000..."

# reCAPTCHA v2 keys:
pos-cli constants set <env> CAPTCHA_RECAPTCHA_SITE_KEY   "6Le..."
pos-cli constants set <env> CAPTCHA_RECAPTCHA_SECRET     "6Le..."

# reCAPTCHA v3 keys (separate provider; v3 has no public test keys):
pos-cli constants set <env> CAPTCHA_RECAPTCHA_V3_SITE_KEY "6Le..."
pos-cli constants set <env> CAPTCHA_RECAPTCHA_V3_SECRET   "6Le..."

# A second widget/site on the same instance — just another pair of constants:
pos-cli constants set <env> CAPTCHA_TURNSTILE_MKTG_SITE_KEY "0x4AAA..."
pos-cli constants set <env> CAPTCHA_TURNSTILE_MKTG_SECRET   "0x4AAA..."
```

> ⚠️ **Never hardcode a secret key** in templates or commit it. Site keys are public by design;
> secret keys are not. Don't `log` the secret or echo it into HTML.

## Install

```bash
pos-cli modules install captchas
```

The module is self-contained — it has **no module dependencies** (no `core` required).

## Usage

### 1. Render the widget in your form

```liquid
<form action="/contact" method="post">
  <input type="hidden" name="authenticity_token" value="{{ context.authenticity_token }}">
  <!-- your fields -->

  {% render 'modules/captchas/widget',
       provider: 'turnstile',
       site_key: context.constants.CAPTCHA_TURNSTILE_SITE_KEY %}

  <button type="submit">Send</button>
</form>
```

On submit, Turnstile injects a hidden input named `cf-turnstile-response` into the form.

### 2. Verify on the server (in your POST page / command)

```liquid
{% liquid
  function captcha = 'modules/captchas/commands/captcha/verify',
    provider: 'turnstile',
    secret: context.constants.CAPTCHA_TURNSTILE_SECRET

  if captcha.valid
    # ...continue handling the submission...
  else
    # reject; render captcha.errors (translation keys)
  endif
%}
```

`verify` reads the token from `context.params` automatically (`cf-turnstile-response` for
Turnstile). If you renamed the widget's response field via its `response_field_name` option, pass
the same `response_field_name:` to `verify` so it reads the right field; or pass the token directly
with `token:`.

### Multiple keys per provider

Just pass the pair you want for a given form:

```liquid
{# marketing site form #}
{% render 'modules/captchas/widget', site_key: context.constants.CAPTCHA_TURNSTILE_MKTG_SITE_KEY %}
...
{% function r = 'modules/captchas/commands/captcha/verify', secret: context.constants.CAPTCHA_TURNSTILE_MKTG_SECRET %}
```

> ⚠️ **hCaptcha + multiple sitekeys: pass `expected_sitekey`.** hCaptcha secrets are
> **account-wide** — the same secret verifies tokens from *every* sitekey in the account. Without
> binding, a token solved against one of your widgets (e.g. a passive/low-friction one) can be
> redeemed on another form. Pass `expected_sitekey:` to `verify` (forwarded as hCaptcha's `sitekey`
> siteverify param, which hCaptcha itself recommends) so such tokens are rejected:
>
> ```liquid
> {% function r = 'modules/captchas/commands/captcha/verify',
>      provider: 'hcaptcha',
>      secret: context.constants.CAPTCHA_HCAPTCHA_SECRET,
>      expected_sitekey: context.constants.CAPTCHA_HCAPTCHA_SITE_KEY %}
> ```
>
> Turnstile and reCAPTCHA don't need this — their secrets are already scoped to a single
> widget/site, so the secret you pass does the binding.

### Provider selection

`provider` may be passed explicitly (`turnstile`, `hcaptcha`, `recaptcha`, or `recaptcha_v3`). If
omitted, it resolves to the `CAPTCHA_DEFAULT_PROVIDER` constant, then falls back to `turnstile`.
Values are normalized (trimmed, lowercased), so `"Turnstile"` or a constant saved with stray
whitespace still resolves; anything that doesn't match a supported provider fails closed:

```bash
pos-cli constants set <env> CAPTCHA_DEFAULT_PROVIDER "turnstile"
```

```liquid
{# provider omitted → uses CAPTCHA_DEFAULT_PROVIDER or 'turnstile' #}
{% render 'modules/captchas/widget', site_key: context.constants.CAPTCHA_TURNSTILE_SITE_KEY %}
{% function r = 'modules/captchas/commands/captcha/verify', secret: context.constants.CAPTCHA_TURNSTILE_SECRET %}
```

## API reference

### Partial: `modules/captchas/widget`

| Param      | Required | Description |
|------------|----------|-------------|
| `site_key` | yes      | The provider's **public** site key. |
| `provider` | no       | `turnstile`, `hcaptcha`, `recaptcha`, or `recaptcha_v3` (default via `CAPTCHA_DEFAULT_PROVIDER`, else `turnstile`). |
| `options`  | no       | Hash of provider widget options (see below). |

**Turnstile `options` keys:** `theme` (`light`/`dark`/`auto`), `size`
(`normal`/`flexible`/`compact`), `action`, `cdata`, `appearance`
(`always`/`execute`/`interaction-only`), `language`, `tabindex`, `callback` (JS function name),
`response_field_name` (default `cf-turnstile-response`), `class_name`, `html_id`.

**hCaptcha `options` keys:** `theme` (`light`/`dark`), `size` (`normal`/`compact`), `tabindex`,
`callback` (JS function name), `expired_callback`, `chalexpired_callback`, `error_callback`,
`open_callback`, `close_callback`, `language` (sets the loader script's `hl` param on first load),
`class_name`, `html_id`.

**reCAPTCHA v2 `options` keys:** `theme` (`light`/`dark`), `size`
(`normal`/`compact`/`invisible`), `tabindex`, `callback` (JS function name), `expired_callback`,
`error_callback`, `badge` (`bottomright`/`bottomleft`/`inline`, invisible only), `language` (sets
the loader script's `hl` param on first load), `class_name`, `html_id`.

> ⚠️ **`size: invisible` needs your own JS.** The partial only renders the widget element — it does
> not auto-execute it. Invisible v2 requires you to trigger the challenge yourself (call
> `grecaptcha.execute()` on submit, or bind the widget to your submit button per Google's invisible
> reCAPTCHA docs) and handle the token via `callback`. Without that wiring the form submits without
> a token and `verify` rejects it with `token_missing` (it fails closed, but the captcha never
> runs). For an invisible flow with no custom JS, use provider `recaptcha_v3` or `turnstile`
> (`appearance: interaction-only`) instead.

**reCAPTCHA v3 `options` keys:** `action` (the v3 action name, default `submit`),
`response_field_name` (hidden input name, default `g-recaptcha-response`). v3 is invisible — there
is no theme/size: on submit it runs `grecaptcha.execute()`, fills a hidden input, and resubmits the
form. Use provider `recaptcha_v3`, and pair the widget's `action` with the verify command's
`expected_action` if you check it.

```liquid
{% render 'modules/captchas/widget',
     site_key: context.constants.CAPTCHA_TURNSTILE_SITE_KEY,
     options: { "theme": "dark", "size": "flexible", "action": "contact" } %}
```

The loader script is emitted only once per page even if the widget is rendered multiple times.

### Command: `modules/captchas/commands/captcha/verify`

| Param       | Required | Description |
|-------------|----------|-------------|
| `secret`    | yes      | The provider's **secret** key (server-side only). |
| `provider`  | no       | `turnstile`, `hcaptcha`, `recaptcha`, or `recaptcha_v3`. Defaults to `CAPTCHA_DEFAULT_PROVIDER`, else `turnstile`. |
| `token`     | no       | The widget token; defaults to the provider's field in `context.params`. |
| `response_field_name` | no | Form field the token is read from; overrides the provider default. Set this to match the widget's `response_field_name` option if you customized it. |
| `remote_ip` | no       | Optional visitor IP forwarded to the provider. |
| `expected_sitekey` | no | **hCaptcha only** — the sitekey the token must have been issued for, forwarded as hCaptcha's `sitekey` siteverify param. hCaptcha secrets are account-wide, so set this whenever the account has more than one sitekey (it stops tokens issued for another widget from being redeemed here). Ignored by other providers. |
| `expected_hostname` | no | Optional hostname allow-list — a single host or comma-separated (e.g. `'example.com,www.example.com'`). When set, the response `hostname` must match one of them (exact, case-insensitive) or `valid` is `false`. Off by default. |
| `min_score` | no       | **reCAPTCHA v3 only** — minimum score (`0.0`–`1.0`) required to pass. Default `0.5`. |
| `expected_action` | no | **reCAPTCHA v3 only** — if set, the response `action` must equal it. |

**Returns** an object:

| Field      | Description |
|------------|-------------|
| `valid`    | Boolean — overall pass/fail. Branch on this. |
| `success`  | Boolean — the provider's raw `success` value (set once the call is made). |
| `provider` | The resolved provider. |
| `response` | The parsed provider response (e.g. `challenge_ts`, `hostname`, `action`, `error-codes`). |
| `score`    | **reCAPTCHA v3 only** — the returned score (`0.0`–`1.0`). |
| `action`   | **reCAPTCHA v3 only** — the returned action name. |
| `errors`   | Hash keyed by field → array of translation keys (e.g. `captcha.errors.verification_failed`). |

Rendering errors:

```liquid
{% for error in captcha.errors %}
  {% for key in error[1] %}
    <p class="error">{{ key | t }}</p>
  {% endfor %}
{% endfor %}
```

## How verification works

`verify` runs the standard **build → check → execute** command pattern:

- **build** — resolves the provider, finds the right token field (`cf-turnstile-response` for
  Turnstile, `h-captcha-response` for hCaptcha, `g-recaptcha-response` for reCAPTCHA v2/v3), and
  pulls the token from `context.params`.
- **check** — requires a token + secret and a supported provider.
- **execute** (per provider) — POSTs `secret`, `response`, and optional `remoteip` to the
  provider's `siteverify` endpoint via the `api_call_send` GraphQL mutation (synchronous), parses
  the JSON response, and sets `valid` from the provider's `success` field.
- **hostname (optional)** — if `expected_hostname` is passed, the response `hostname` must match one
  of the listed hosts (exact, case-insensitive) or `valid` is set to `false` (with
  `captcha.errors.hostname_mismatch`). Off by default: the providers already bind keys to registered
  domains, so this is defense-in-depth against a token solved on a different domain and replayed to
  your server. `success` still reflects the provider's raw verdict.

Endpoints (each provider's `public/api_calls/*_siteverify.liquid`):

- **Turnstile** — `https://challenges.cloudflare.com/turnstile/v0/siteverify` (JSON body).
- **hCaptcha** — `https://api.hcaptcha.com/siteverify` (`application/x-www-form-urlencoded` body;
  hCaptcha does not accept JSON, so values are URL-encoded). When `expected_sitekey` is passed to
  `verify`, it is sent as the optional `sitekey` param and hCaptcha rejects tokens issued for a
  different sitekey.
- **reCAPTCHA** (v2 and v3) — `https://www.google.com/recaptcha/api/siteverify`
  (`application/x-www-form-urlencoded` body; values URL-encoded).

**reCAPTCHA v3** reuses v2's endpoint and the same `recaptcha_siteverify.liquid` api_call template,
but its verify step passes only when `success` is true **and** `score >= min_score` (default `0.5`)
**and** — if `expected_action` is given — the response `action` matches. The `score` and `action`
are returned on the result object so callers can log or tune them.

## ⚠️ Billing

The server-side verify call is a **normal, billable platformOS API call** — it is **not
exempt** from API usage billing. Each `verify` performs one outbound `siteverify` request.

## Adding a provider

Turnstile, hCaptcha, and reCAPTCHA are worked examples of the shape. Each provider is a widget
partial + a verify command. To add another provider `<name>`:

1. `public/views/partials/providers/<name>/widget.liquid` — emit the provider's script + element.
2. `public/api_calls/<name>_siteverify.liquid` — the POST to the provider's siteverify URL
   (every provider except Turnstile here expects `application/x-www-form-urlencoded`; URL-encode
   the values).
3. `public/lib/commands/captcha/providers/<name>/verify.liquid` — call `api_call_send` and
   normalize `success`.
4. Register the provider:
   - add a `when '<name>'` in `public/views/partials/widget.liquid`,
   - add a `when '<name>'` in `public/lib/commands/captcha/verify.liquid`,
   - map its token field in `public/lib/commands/captcha/verify/build.liquid`,
   - add `<name>` to the `supported_providers` list in
     `public/lib/commands/captcha/verify/check.liquid`.

## Testing

Turnstile, hCaptcha, and reCAPTCHA v2 publish dummy keys that work without a real account.
reCAPTCHA **v3** has **no public test keys** — it requires real keys registered in the reCAPTCHA
admin console and tied to your domain.

**Turnstile** (Cloudflare):

| Outcome         | Site key                     | Secret key                            |
|-----------------|------------------------------|---------------------------------------|
| always pass     | `1x00000000000000000000AA`   | `1x0000000000000000000000000000000AA` |
| always fail     | `2x00000000000000000000AB`   | `2x0000000000000000000000000000000AA` |
| force challenge | `3x00000000000000000000FF`   | (use a pass/fail secret)              |

**hCaptcha:**

| Outcome     | Site key                               | Secret key                                   |
|-------------|----------------------------------------|----------------------------------------------|
| always pass | `10000000-ffff-ffff-ffff-000000000001` | `0x0000000000000000000000000000000000000000` |

**reCAPTCHA** (v2; Google's automated-testing keys — always pass, widget shows a warning banner):

| Outcome     | Site key                                   | Secret key                                 |
|-------------|--------------------------------------------|--------------------------------------------|
| always pass | `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI` | `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe` |

The example app pages `app/views/pages/captcha-demo.liquid` (form) and
`app/views/pages/captcha-verify.liquid` (verification result) are a runnable end-to-end demo:
deploy the app, then open `/captcha-demo` (Turnstile), `/captcha-demo?provider=hcaptcha`,
`/captcha-demo?provider=recaptcha` (v2), or `/captcha-demo?provider=recaptcha_v3`, submit, and
you'll see a pass result (the raw provider response is shown for transparency). For Turnstile, swap
to the `2x…` keys to see a failing verification. The v3 page reads the
`CAPTCHA_RECAPTCHA_V3_SITE_KEY` / `CAPTCHA_RECAPTCHA_V3_SECRET` constants (it shows setup
instructions until they're set) and displays the returned score.
