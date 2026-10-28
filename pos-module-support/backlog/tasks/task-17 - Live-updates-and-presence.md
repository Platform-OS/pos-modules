---
id: TASK-17
title: 'Live updates and presence'
status: Done
assignee:
  - "@arturpawlak"
created_date: '2026-10-27'
labels:
  - mvp
  - ui
dependencies:
  - TASK-10
  - TASK-11
priority: high
ordinal: 1170
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
websocket rooms per department, ticket and user; broadcast consumers; queue row refresh; presence viewing/replying; new-message warning before send.

Spec: tech-spec 05 §4.
Files: public/lib/consumers/*/broadcast_*.liquid; public/views/partials/channels/**; public/assets/js/pos-support-live.js
Tests: E2E scenario 5
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Second browser sees a new ticket row without reload
- [x] #2 Presence shows within 20 s
- [x] #3 Sending after a new customer message requires acknowledging the warning
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added the "support" channel (channels/support/subscribed and receive: active membership and room scope checked on subscribe and on every message; receive only accepts presence pings in ticket rooms, takes the sender from the session and suppresses the client rebroadcast), queries/channels/can_join, graphql channels/broadcast (channel_send_message), commands/channels/ticket_changed (ids only to queue-<department>, ticket-<id> and, for assignments, profile-<assignee>), broadcast_live consumers for ticket created, status/priority/fields changed, merged, assigned, customer message and reply, the row endpoint support-desk/tickets/:id/row, queries/tickets/lookup (shared with the queue search), the vendored ActionCable client (same file as pos-module-chat) and pos-support-live.js (queue row refresh and insert, presence every 20 s with expiry, new-message guard with a required acknowledgement, assignment toast).
Outcome: Two-browser check on support-dev (Playwright, agent Agnes in DOB + admin): a new emailed ticket appeared in the agent's queue without reload; the admin's ticket page showed "Agnes Agent is viewing"; a customer reply while the admin was drafting showed the warning and the form would not submit until acknowledged. Added an agent test user (artur+sd-agent alias, DOB); new DOB tickets now auto-assign to it and send its alerts there.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
