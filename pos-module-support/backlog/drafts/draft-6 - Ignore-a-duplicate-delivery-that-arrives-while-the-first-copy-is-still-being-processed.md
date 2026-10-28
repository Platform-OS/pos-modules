---
id: DRAFT-6
title: 'Ignore a duplicate delivery that arrives while the first copy is still being processed'
status: Done
assignee: []
created_date: '2026-10-28'
labels:
  - email
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E2E case B20 fails: the same email (same Message-ID) posted twice ~9 s apart created two tickets. inbound/process treats an email as a duplicate only when another inbound_email with that Message-ID is already `processed`, and the Message-ID is stored only when processing finishes, so a second delivery during the first one's processing is not caught. Providers do redeliver (timeouts, retries).

Fix: store message_id_header when processing starts; treat as duplicate another delivery that is processed, or still `received` with a lower id and less than 15 minutes old (so a stuck copy never blocks mail for good, and of two simultaneous deliveries exactly one wins).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Two deliveries of one Message-ID create one message, also when the second arrives during the first's processing
- [x] #2 A delivery stuck in received for over 15 minutes does not block a redelivery
- [x] #3 E2E B20 and inbound unit tests pass
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: inbound/process stores message_id_header when processing starts and ignores a delivery when another copy is processed, or still received with a lower id and under 15 minutes old; unit case added to inbound_rules_test.
Outcome: E2E B20 and 26/26 unit tests pass.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
