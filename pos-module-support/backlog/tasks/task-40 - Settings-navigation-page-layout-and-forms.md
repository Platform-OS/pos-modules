---
id: TASK-40
title: 'Settings: navigation, page layout and forms'
status: Done
assignee: []
created_date: '2026-10-29'
labels:
  - ui
  - iteration-2
dependencies:
  - TASK-32
  - TASK-34
priority: medium
ordinal: 1400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Settings sub-navigation as a grouped left column (Routing: Departments, Statuses, Assignment, SLA and hours; Content: Saved replies, Branding; Channels: Email, Integrations; People: Team, Blocklist); a select on mobile.
- Page header with title, one-line description and the primary action.
- Form pattern: 40rem column, stacked fields, help text under the field, right-aligned actions footer; never full-width Save on desktop.
- Tables share the queue table style; state pills (Active/Inactive, Invited); Edit as a ghost button.
- Fix sideways scroll at 390px (sr-only header escaping the scroller; unwrapped DNS tables on Email).
- Confirmations for destructive actions: decline request, revoke invite, rotate webhook URL, turn off ticket email, unblock.
- Email page steps as a stepper with done/pending state; humanised timestamps.

Source: UX review of 2026-10-29 (design critique 19/40, technical audit 12/20), with findings checked against JJ's build and Linear / Front / Help Scout patterns. Reports: docs/ux/ux-review-2026-10-29.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No horizontal scroll on any settings page at 390px
- [x] #2 Every destructive settings action asks for confirmation
- [x] #3 Sub-navigation grouped and current page clear without colour alone
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Settings: grouped left navigation with icons (horizontal strip on narrow screens), stacked form fields, tables in the shared style with state pills, DNS tables wrapped and keyboard-focusable, confirmations for decline, revoke, rotate webhook URL and turn off email, humanised times.
Outcome: No sideways scroll on any settings page at 390 px; destructive actions ask first. Verified on support-dev: last full E2E run 34 passed, 1 skipped (fresh install), 1 failed (scenario 15 live list update under load, passes alone twice; same intermittent delay as DRAFT-9); 26/26 Liquid unit tests pass; axe WCAG 2.2 AA 0 violations on 16 pages × light/dark × 1440/390; no sideways scroll at 390 px; platformos-check and ci-static clean.
Next: Add/edit in a side panel, SLA durations as number + unit, Team search.
<!-- SECTION:FINAL_SUMMARY:END -->
