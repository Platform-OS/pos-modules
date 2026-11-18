---
id: TASK-52
title: 'Triage write tools behind human approval: priority, status, snooze, assign'
status: Done
assignee: []
created_date: '2026-11-18 16:58'
updated_date: '2026-11-18 18:49'
labels:
  - security
dependencies:
  - TASK-51
documentation:
  - docs/mcp-implementation-notes.md
priority: medium
ordinal: 6470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Four more proposal-only tools once the approval round trip from the internal note tool has been used in anger: set priority, change status, snooze until a date, assign to a team member.

Each wraps the ticket command the desk UI already uses, so validations, events and SLA bookkeeping are the ones the desk enforces rather than a raw record write. Same deferred-execution rule as the note tool: reload and re-check at approval time.

Also decide, before building these, whether every change deserves the same approval weight. Setting a priority and emailing a customer currently go through one gate. Starting strict and relaxing later is easy; the reverse is not.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each tool wraps the existing ticket command, not a record write
- [x] #2 An approved change produces the same events and audit entries as the same change made in the desk UI
- [x] #3 An agent cannot propose a change to a ticket outside their departments
- [x] #4 A decision is recorded on whether small changes keep the same approval gate
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: support_set_priority, support_change_status, support_snooze_ticket and support_assign_ticket, each wrapping the command the desk's own pages use, so SLA recalculation, status categories, assignee eligibility, activity rows and events behave exactly as they do for someone clicking in the desk. status is a free string rather than an enum because each desk configures its own statuses; the assignee is an email address, or 'me', or 'none'.
Outcome: 28 assertions pass. An unknown status and an address with no account are refused; a snooze time already in the past is refused rather than stored as a snooze the sweep would immediately clear; 'me' assigns to the proposing member. Live over HTTP all four answer pending_approval, and a fourth pending proposal from one principal is refused queue_full by the engine's own cap.
Next: The approval decision was also made global rather than per agent — see the approval_enforced switch in docs/mcp-engine/.
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
