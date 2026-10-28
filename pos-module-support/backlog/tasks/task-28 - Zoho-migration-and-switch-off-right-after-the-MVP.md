---
id: TASK-28
title: 'Zoho migration and switch-off (right after the MVP)'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - ops
dependencies:
  - TASK-27
priority: medium
ordinal: 1280
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Export open Zoho tickets and the last 12 months of closed ones with threads, contacts, accounts and agents; import through module commands with legacy numbers and original Message-IDs; dry run with a reconciliation report; import; switch remaining Zoho forwarding off; Zoho read-only for 90 days.

Spec: tech-spec 09 §5, PRD MG-1..MG-4, D-19.
Files: installation repo (import script + migration)
Tests: reconciliation report
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reconciliation counts per status and department match
- [ ] #2 Replies to old Zoho emails thread to imported tickets
- [ ] #3 No email is routed to Zoho any more
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
