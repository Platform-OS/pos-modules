---
id: TASK-53
title: Customer reply tool behind human approval
status: Done
assignee: []
created_date: '2026-11-18 16:58'
updated_date: '2026-11-18 18:49'
labels:
  - security
dependencies:
  - TASK-52
documentation:
  - docs/mcp-implementation-notes.md
priority: medium
ordinal: 7470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The last write tool, and the only one that leaves the building: support_reply proposes an email reply to the customer on a ticket.

Build it only after the approval step has been used enough to trust it. A person must read the exact wording before it sends; nothing about an assistant drafting well changes that.

Wraps the existing reply command so threading, attachments, SLA clocks and delivery tracking behave as they do from the desk UI. Deferred execution means the thread may have moved on between proposal and approval: reload the ticket, and refuse when the customer has written again since the draft was made.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Nothing sends until a person has read the exact wording
- [x] #2 The reply threads, clears needs_reply and updates SLA exactly as a reply sent from the desk does
- [x] #3 A proposal is refused at approval time when the customer has written again since it was made
- [x] #4 The ledger records both the member the reply was sent as and the person who approved it
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: support_reply_to_customer, the only tool whose result leaves the desk. Wraps commands/messages/create_reply, so threading, the Message-ID, the reply token, needs_reply and the SLA clocks are the desk's own. Plain text in, converted by helpers/text_to_html, so an agent cannot put markup into a customer email; CC and attachments are deliberately not offered, since both widen who receives this beyond the person approving it.
Outcome: The staleness guard works: last_activity_at is required and must match the ticket when the handler finally runs, so a reply drafted against an older thread is refused and sends nothing (asserted, with the public message count still zero). An accepted reply is stored for sending, authored by the member who proposed it. destructiveHint is true and openWorldHint is true on this tool alone.
Next: None.
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
