---
id: DRAFT-2
title: 'Warn an agent when a colleague replies on the ticket they are writing in'
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
E2E scenario A5 (02-ticket-work.spec.ts, test 5) fails: with two agents on one ticket, when agent B sends a reply, agent A's composer shows no warning. pos-support-live.js only reacts to `kind: 'message'` (customer messages); a colleague's reply is broadcast as `kind: 'reply'` without the sender, so the page cannot tell it apart from its own reply. Spec 10 §3 scenario 5: "second sender warned".

Fix: pass the actor's profile id in the live payload (commands/channels/ticket_changed `actor_id`, set by the support_reply_created consumer) and show the new-message warning for a `reply` whose actor is not the current agent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A reply sent by another agent shows the new-message warning in an open composer within seconds
- [x] #2 The sender's own reply does not show the warning
- [x] #3 E2E A5 passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: the reply broadcast carries actor_id (commands/channels/ticket_changed); pos-support-live.js shows the new-message warning for a reply whose actor is not the current agent.
Outcome: E2E A5 passes; the sender's own reply does not warn.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
