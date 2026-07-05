# Changelog

## 1.0.0

Initial release.

- Generic captcha abstraction: `modules/captchas/widget` partial + `modules/captchas/commands/captcha/verify` command (build → check → execute, fail-closed).
- Providers: Cloudflare Turnstile, hCaptcha, reCAPTCHA v2, and reCAPTCHA v3 (score threshold + optional action check).
- Keys are caller-supplied per call — multiple keys for the same provider on one instance.
- Optional `expected_sitekey` param (hCaptcha) — forwarded to siteverify so tokens issued for
  another sitekey of the same account are rejected (hCaptcha secrets are account-wide).
- Optional `expected_hostname` allow-list check as defense-in-depth.
- Widget attribute values (site key, options) are HTML-escaped.
- English and Polish translations, runnable example app demo, and unit tests for the build/check/fail-closed paths.
