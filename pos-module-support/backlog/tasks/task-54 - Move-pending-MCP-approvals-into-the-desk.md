---
id: TASK-54
title: Move pending MCP approvals into the desk
status: Done
assignee: []
created_date: '2026-11-18 16:58'
updated_date: '2026-11-18 19:44'
labels:
  - ui
dependencies:
  - TASK-51
documentation:
  - docs/mcp-tools-proposal.md
priority: low
ordinal: 8470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Changes an assistant proposes wait in the MCP admin console (/mcp-admin). That is the wrong place: the people qualified to judge a reply to a customer work in the desk, next to the tickets, and most of them have no reason to hold an MCP operator role.

Add a desk page listing the pending proposals a manager may act on, with approve and reject, reading the MCP module's approval records. It needs its own desk permission, and has to show both identities the engine records: the member the action would run as, and the person approving it.

Decide who may approve: any manager, or only the ticket's assignee.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A manager approves and rejects proposals without opening the MCP admin console
- [x] #2 The page shows the proposed action in full, including the exact wording of anything that would reach a customer
- [x] #3 The page shows who the action runs as and who approved it
- [x] #4 A decision is recorded on who may approve
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: /support-desk/approvals lists what assistants have proposed, with every argument shown in full and escaped, a link to the ticket, and Approve / Turn down. Decisions go through the engine's own claim -> execute -> record_outcome sequence, so an approved action runs as the member who PROPOSED it, never as the approver, and both identities are in the ledger.
Outcome: A manager or admin sees proposals in their scope; an agent sees only proposals about tickets assigned to them, and department scope is applied by loading each proposal's ticket through queries/tickets/find. commands/mcp/decide re-checks that the proposal is in the member's visible list, so a stale page or a hand-made POST cannot decide something they could not see. Rendered live: the pending proposal from the ChatGPT test shows its note text in full.
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
