---
id: TASK-51
title: Internal note tool behind human approval
status: Done
assignee: []
created_date: '2026-11-18 16:58'
updated_date: '2026-11-18 18:49'
labels:
  - security
dependencies:
  - TASK-48
documentation:
  - docs/mcp-implementation-notes.md
priority: medium
ordinal: 5470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first write tool: support_add_note proposes an internal note on a ticket. Never emailed to the customer. The natural first use is 'summarise this thread and note what we have tried'.

Set requires_approval: true in the manifest. pos-module-mcp then never runs the handler inline: it stores the validated arguments, returns an opaque handle, and executes the handler only when an operator approves, as the original principal. The agent polls the built-in mcp_approval_status tool.

Because the handler runs later, it must not trust the state the arguments were written against: reload the ticket and re-check the member's department scope inside the handler.

The engine already caps pending proposals at three per person, deduplicates identical ones and expires them after seven days. Do not add a second queue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An approved proposal writes the note as the member who proposed it, not as the approver
- [x] #2 The note never reaches the customer
- [x] #3 The handler re-checks the ticket and the member's scope at approval time, and refuses when either has changed
- [x] #4 A rejected or expired proposal writes nothing
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: support_add_note, plus the shared foundation every write tool uses — policies/desk_write (gates on support.tickets.reply, the same permission every desk page that writes declares), helpers/load_for_write (re-resolves the member and reloads the ticket when the handler finally runs) and helpers/command_result (maps a desk command's contract to a handler result, translating a bare key rather than handing the agent 'modules/support/...').
Outcome: Verified live over HTTP: the proposal returns pending_approval with a handle, mcp_approval_status reports pending, and the ticket had zero messages — nothing written. app/lib/test/support/mcp_write_test.liquid covers the handler as the engine calls it after approval: the note is internal, is authored by the member who proposed it rather than the approver, markup in the note is escaped not stored as live HTML, @names notify nobody (mentioned_ids is passed empty on purpose), and a member who loses the department between proposal and approval is refused with nothing written.
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
