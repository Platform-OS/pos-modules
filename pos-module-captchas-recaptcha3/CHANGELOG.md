# Changelog

## 1.1.0

- Errors are now recorded with `modules/captchas/helpers/add_error` (in both `commands/verify`
  and `helpers/score_check`), so `result.errors` holds translated messages instead of
  `modules/captchas/errors.*` keys — drop any `| t` you apply to them. Requires
  `captchas ^1.1.0`.

## 1.0.0

Initial release. Google reCAPTCHA v3 (invisible, score-based) provider for the
[captchas](https://github.com/Platform-OS/pos-module-captchas) abstraction module:

- `modules/captchas_recaptcha3/widget` — invisible v3 integration: wires the enclosing
  form's submit to `grecaptcha.execute()`, injects the token into a hidden input, and
  resubmits; dispatched by the abstraction's `modules/captchas/widget`.
- `modules/captchas_recaptcha3/commands/verify` — server-side siteverify call
  (`https://www.google.com/recaptcha/api/siteverify`, form-urlencoded), fail-closed on
  transport errors, non-200 responses, and non-JSON bodies.
- `modules/captchas_recaptcha3/helpers/score_check` — pure score/action gate
  (`min_score` threshold, default 0.5; optional `expected_action` match), unit-testable
  without network.
- `modules/captchas_recaptcha3/helpers/config` — provider config (default response field
  `g-recaptcha-response`).
- Extracted from the captchas module's bundled implementation as part of the provider
  split. **The provider key changed from `recaptcha_v3` to `recaptcha3`** — update
  `provider:` arguments and `CAPTCHA_DEFAULT_PROVIDER` values accordingly.
