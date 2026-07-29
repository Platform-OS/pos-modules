# Changelog

## 1.1.0

- Errors are now recorded with `modules/captchas/helpers/add_error`, so `result.errors` holds
  translated messages instead of `modules/captchas/errors.*` keys — drop any `| t` you apply
  to them. Requires `captchas ^1.1.0`.

## 1.0.0

Initial release. Google reCAPTCHA v2 (checkbox / invisible) provider for the
[captchas](https://github.com/Platform-OS/pos-module-captchas) abstraction module:

- `modules/captchas_recaptcha/widget` — reCAPTCHA v2 widget partial (loader script +
  widget div), dispatched by the abstraction's `modules/captchas/widget`.
- `modules/captchas_recaptcha/commands/verify` — server-side siteverify call
  (`https://www.google.com/recaptcha/api/siteverify`, form-urlencoded), fail-closed on
  transport errors, non-200 responses, and non-JSON bodies.
- `modules/captchas_recaptcha/helpers/config` — provider config (default response field
  `g-recaptcha-response`).
- Extracted from the captchas module's bundled reCAPTCHA implementation as part of the
  provider split. reCAPTCHA v3 (score-based) is the separate `captchas_recaptcha3` module.
