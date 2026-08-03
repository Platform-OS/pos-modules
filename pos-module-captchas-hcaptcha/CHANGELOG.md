# Changelog

## 1.1.0

- Errors are now recorded with `modules/captchas/helpers/add_error`, so `result.errors` holds
  translated messages instead of `modules/captchas/errors.*` keys — drop any `| t` you apply
  to them. Requires `captchas ^1.1.0`.
- Other code improvements: internal cleanups with no change to behavior or the public API.

## 1.0.0

Initial release. hCaptcha provider for the
[captchas](https://github.com/Platform-OS/pos-module-captchas) abstraction module:

- `modules/captchas_hcaptcha/widget` — hCaptcha widget partial (loader script + widget div),
  dispatched by the abstraction's `modules/captchas/widget`.
- `modules/captchas_hcaptcha/commands/verify` — server-side siteverify call
  (`https://api.hcaptcha.com/siteverify`, form-urlencoded), fail-closed on transport errors,
  non-200 responses, and non-JSON bodies. Forwards `expected_sitekey` as hCaptcha's `sitekey`
  param to bind account-wide secrets to a specific widget.
- `modules/captchas_hcaptcha/helpers/config` — provider config (default response field
  `h-captcha-response`).
- Extracted from the captchas module's bundled hCaptcha implementation as part of the
  provider split.
