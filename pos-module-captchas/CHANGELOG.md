# Changelog

## 1.1.0

- `object.errors` now holds **translated messages** instead of `modules/captchas/errors.*`
  translation keys, matching `modules/core/helpers/register_error` and the rest of the
  platformOS modules. Callers can pass `result.errors[field]` straight to
  `modules/common-styling/forms/error_list` (which renders each entry raw); previously that
  printed a raw key to end users.
- New `modules/captchas/helpers/add_error` — translates a `modules/captchas/errors.*` key and
  **appends** it to a field, so multiple errors can accumulate on one field (the previous
  `hash_merge` replaced the field's array). This is now the documented way for provider
  modules to record errors; see the provider contract in the README.
- **Migration:** drop any `| t` you apply to values from `result.errors` — the strings are
  already translated. Provider modules must depend on `captchas ^1.1.0`.

## 1.0.0

Initial release.

- Generic, provider-agnostic captcha abstraction: `modules/captchas/widget` partial +
  `modules/captchas/commands/captcha/verify` command (build → check → execute, fail-closed).
- Providers are separate modules (`captchas_<key>`) dispatched by naming convention — the
  abstraction contains no provider code. Official providers: `captchas_turnstile`,
  `captchas_hcaptcha`, `captchas_recaptcha` (v2), `captchas_recaptcha3` (v3, score-based).
- Provider availability gate (`helpers/provider_available`): key charset validation,
  optional `CAPTCHA_ENABLED_PROVIDERS` allow-list (CSV, exact match), and an
  installed-module probe via the provider's required `provider.name` translation — an
  unavailable provider degrades gracefully (logged HTML comment / `unsupported_provider`
  error), never a hard error.
- Provider selection: explicit `provider:` argument, else the `CAPTCHA_DEFAULT_PROVIDER`
  constant; no built-in fallback.
- Keys are caller-supplied per call — multiple keys for the same provider on one instance.
- Generic policy checks in the abstraction: `expected_hostname` allow-list
  (exact, case-insensitive), fail-closed build/check phases; provider-specific params
  (`expected_sitekey`, `min_score`, `expected_action`) are passed through.
- Documented provider contract (widget partial + `helpers/config` + `commands/verify` +
  `provider.name` translation) for third-party provider modules.
- English and Polish translations for all error keys, a deterministic fake provider
  (`app/modules/captchas_test`) powering the unit-test suite and the example-app demo.
