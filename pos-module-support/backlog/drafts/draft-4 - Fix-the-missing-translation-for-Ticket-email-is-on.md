---
id: DRAFT-4
title: 'Fix the missing translation for Ticket email is on'
status: Done
assignee: []
created_date: '2026-10-28'
labels:
  - ui
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E case B7 (tests/e2e/07-plan.spec.ts) fails: Settings → Email shows "translation missing: en.modules/support/settings_email.step6.on" once email is enabled. In translations/en/en.yml the keys `on:` and `off:` under step6 are unquoted, so YAML reads them as the booleans true/false and the string keys do not exist (the same gotcha as the `off` key noted in 12-gotchas).

Fix: quote the keys (`"on":`, `"off":`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings → Email shows "Ticket email is on." / "…off…" with no missing translation
- [x] #2 E2E B7 passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: quoted the `on`/`off` keys in translations/en/en.yml.
Outcome: no missing translation on any desk page as admin or agent (E2E B7 passes).
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
