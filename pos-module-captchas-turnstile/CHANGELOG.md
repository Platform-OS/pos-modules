# Changelog

## 1.0.0

Initial release. Cloudflare Turnstile provider for the
[captchas](https://github.com/Platform-OS/pos-module-captchas) abstraction module:

- `modules/captchas_turnstile/widget` — Turnstile widget partial (loader script + widget div),
  dispatched by the abstraction's `modules/captchas/widget`.
- `modules/captchas_turnstile/commands/verify` — server-side siteverify call
  (`https://challenges.cloudflare.com/turnstile/v0/siteverify`), fail-closed on transport
  errors, non-200 responses, and non-JSON bodies.
- `modules/captchas_turnstile/helpers/config` — provider config (default response field
  `cf-turnstile-response`).
- Extracted from the captchas module's bundled Turnstile implementation as part of the
  provider split.
