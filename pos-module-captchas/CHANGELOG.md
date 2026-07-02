# Changelog

## 1.0.0

Initial release.

- Generic captcha abstraction: `modules/captcha/widget` partial + `modules/captcha/commands/captcha/verify` command (build → check → execute, fail-closed).
- Providers: Cloudflare Turnstile, hCaptcha, reCAPTCHA v2, and reCAPTCHA v3 (score threshold + optional action check).
- Keys are caller-supplied per call — multiple keys for the same provider on one instance.
- Optional `expected_hostname` allow-list check as defense-in-depth.
- English and Polish translations, runnable example app demo, and unit tests for the build/check/fail-closed paths.
