---
id: DRAFT-9
title: 'Send live updates for agent actions without waiting for a background job'
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
E2E scenario A15 (05-board-blocklist.spec.ts) failed intermittently (1 run in 3): after a card was dragged on one board, the queue list in another browser had not updated after 45 s. All live broadcasts were sent by event consumers (background jobs), so when the job queue is busy (a burst of status changes, SLA and notification jobs) an update can lag by tens of seconds; isolated changes arrive in 0.6–2.4 s (measured in TASK-30).

Fix: the commands that run in an agent's request — change_status, assign, set_priority, create_reply — broadcast to the live rooms themselves right after publishing their event; their broadcast_live consumers are removed. Broadcasts for work that already runs in background jobs (new tickets, inbound messages, SLA, merges) stay in consumers. The reply broadcast now carries actor_id (see DRAFT-2).

Note: partial deploys do not delete files, so the four removed consumers are still on support-dev until a full deploy; there they send a second, harmless broadcast.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Status, assignee, priority and reply changes made by an agent reach other open boards and lists without depending on the job queue
- [x] #2 E2E A15 passes on repeated runs
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: change_status, assign, set_priority and create_reply broadcast to the live rooms inline; their four broadcast_live consumers removed.
Outcome: E2E A15 passed in both full runs after the change.
Next: the four removed consumers remain on support-dev until a full deploy (harmless second broadcast).
<!-- SECTION:FINAL_SUMMARY:END -->
