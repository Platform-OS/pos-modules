# Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

## v5.3.1
* Fix: verification links were valid for 60 days instead of the configured 24 hours - `temporary_token` reads its arguments in hours and prefers the deprecated `valid_for`, so the TTL was being multiplied by 60
* Fix: `user/find.graphql` declared `$valid_for: Int = 1`, which overrode the `$expires_in` next to it for every caller; password reset links kept their one hour lifetime, now stated explicitly
* Fix: registration returned a 500 after creating the account on instances with `VERIFY_HCAPTCHA` enabled - the `hcaptcha` filter raises when handed no params. Captcha is now checked only by the endpoints that render the widget, and the resend forms render one
* Fix: the resend cap collapsed to one email per day after a user first reached it, because the counter was never restarted outside the 24h window
* Fix: a user who never confirmed their address but completed a password reset was redirected with no session and no explanation; that proof of mailbox control now confirms the address. Same for a sign-in through an OAuth provider
* Fix: `hook_user_email_verified` and `user_email_verified` now fire for OAuth sign-ups too, not only for the link
* Fix: an invalid verification token wrote an ERROR line to the log on every request
* Fix: `email_verification.check_email.sent_to_html` is now `sent_to` and carries no markup - `t` escapes a translation that had a value interpolated into it, tags included, so the `<strong>` around the address was reaching users as literal text
* Fix: the blocked-login screen sends a fresh link and redirects, instead of rendering in place and showing its message twice
* Fix: the link lifetime in the emails and on the screens follows the configured TTL instead of naming 24 hours
* Fix: the impersonation page's slug is `sessions/impersonations(/:user_id)`, making the id segment genuinely optional. Written as `:user_id` it was required, so a form submitting the id as a field got a 404 on any instance with `slug_exact_match` on and "Impersonate" did nothing; both spellings now resolve
* Example app: seeded profiles are backfilled as verified, and the Playwright suite covers the verification flow

## v5.3.0
* Feature: optional email verification on registration, off unless `USER_EMAIL_VERIFICATION_ENABLED` is set

## v5.1.1

* Fix: remove theme_render for can_do_or_unauthorized command

## v5.1.0
* Added the change email function
* Added support for 2FA one-time passwords

## v5.0.0
* This release introduces built-in profiles based on the now obsolete profile module.

## v4.1.1
* Fix: Hide OAuth 2 section when no providers are available

## v4.1.0
* Feature: OAuth 2

## v4.0.0
* Replaced components with common styling

## v3.1.1

* Fix: Session variables on log-out.

## v3.1.0

* Feature: add impersonation feature

## v3.0.10

* Fix: redirect user to `session.return_to` after sign up, automatically log user in by default

## v3.0.9

Added `redirect_anonymous_to_login` and `anonymous_return_to` parameters to `can_do_or_unauthorized` command

## v3.0.7

Chore: bump core module

## v3.0.6

Add `modules/user/queries/roles/custom` and `modules/user/queries/roles/all` queries to get roles based on `permissions` file

## v3.0.3

* Fix modules/user/roles/append, modules/user/roles/remove and modules/user/roles/set commands
* Added `tests` module as a dependency and provide some unit tests that reproduced the issue


## v3.0.1

* Merge `user` and `permissions` modules into one
* Move `roles` array from a dedicated table to `user.yml` for performance and reducing complexity
* Move permissions to a single Liquid file for performance and simplicity

## [v1.0.2](https://github.com/Platform-OS/pos-module-user/compare/v1.0.1...v1.0.2)

> 10 November 2022

### Breaking changes

### Merged pull requests
- Update changelog template [`#13`](https://github.com/Platform-OS/pos-module-user/pull/13)

### Fixes

## [v1.0.1](https://github.com/Platform-OS/pos-module-user/compare/v1.0.0...v1.0.1)

> 2 November 2022

### Breaking changes

### Merged pull requests
- Fix typo [`#6`](https://github.com/Platform-OS/pos-module-user/pull/6)

### Fixes

## v1.0.0

> 2 November 2022

### Breaking changes

### Merged pull requests
- Versioning [`#8`](https://github.com/Platform-OS/pos-module-user/pull/8)
- Use build/check when validating the authentication [`#11`](https://github.com/Platform-OS/pos-module-user/pull/11)
- Permission handling for registration [`#10`](https://github.com/Platform-OS/pos-module-user/pull/10)
- admin hooks [`#9`](https://github.com/Platform-OS/pos-module-user/pull/9)
- Register and session handlers [`#7`](https://github.com/Platform-OS/pos-module-user/pull/7)
- Authentication and authorization [`#4`](https://github.com/Platform-OS/pos-module-user/pull/4)
- Add roles and permission support [`#3`](https://github.com/Platform-OS/pos-module-user/pull/3)
- User list [`#2`](https://github.com/Platform-OS/pos-module-user/pull/2)
- Basics (create, load, delete) [`#1`](https://github.com/Platform-OS/pos-module-user/pull/1)

### Fixes
