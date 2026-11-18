---
id: TASK-55
title: 'Request to join: report the refused field instead of blaming the email address'
status: Done
assignee: []
created_date: '2026-11-18 17:36'
labels:
  - security
dependencies: []
priority: high
ordinal: 9470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The "Request to join" form refused a correct email address. A one-word name in the "Your name" field was split into first_name plus a blank last_name; modules/user/commands/user/create requires both, so it failed, and commands/auth/join reported every create failure as errors.email -> "Enter a valid email address." People retyped a correct address while the real cause stayed invisible. The invite path (commands/team/accept_invite) writes the profile name directly and accepts a one-word name, so the desk also contradicted itself.

Fix: auth/join checks for a first and last name up front and reports it on the name field; a refusal from modules/user is mapped to the field it belongs to (email, password, name) with a form-level message as the fallback; the real errors are logged for operators. The join partial renders a form-level callout, matching the sign-in page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A one-word name is refused on the name field, not the email field
- [ ] #2 A refusal that only modules/user can see lands on the field it belongs to
- [ ] #3 A two-letter domain such as ex.com is accepted and creates the account
- [ ] #4 A refused form creates no account
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: commands/auth/join validates that the name has a first and last part, and maps a modules/user refusal to the right field; new translation keys join.errors.full_name and join.errors.failed; the join partial renders a form-level callout.
Outcome: Submitting name 'Filip' with filip@ex.com now answers 422 with 'Enter your first and last name.' instead of 'Enter a valid email address.' Verified live over HTTP on ps, and by app/lib/test/support/join_test.liquid (11 assertions). The test bites: reverting both halves of the fix fails 4 of them, including 'expected modules/support/team.errors.email to equal none'. platformos-check and ci-static clean.
Next: The errors.form fallback is a catch-all with no deterministic trigger, so it is not covered by a test.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met and checked
- [ ] #2 Every changed Liquid/GraphQL/YAML file passed validate_code before it was written; check-run reports zero errors
- [ ] #3 Tests written and passing; each fails when its behaviour is removed
- [ ] #4 Deployed to staging with deploy-start (never pos-cli deploy) and smoke-checked via URL + logs-fetch
- [ ] #5 Security invariants hold: permission check, department scope, CSRF on POST, ownership load before by-id writes, no secrets or bodies in logs
- [ ] #6 All user-visible strings in translations/en.yml; no translation missing
- [ ] #7 Accessible: keyboard, focus, 4.5:1 contrast on default and example host theme, status not by colour alone
- [ ] #8 README / CLAUDE.md / SKILL.md updated when behaviour, hooks, settings or constants change
- [ ] #9 Final summary written as Done / Outcome / Next
<!-- DOD:END -->
