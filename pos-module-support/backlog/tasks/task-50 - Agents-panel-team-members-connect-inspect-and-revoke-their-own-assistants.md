---
id: TASK-50
title: 'Agents panel: team members connect, inspect and revoke their own assistants'
status: Done
assignee: []
created_date: '2026-11-18 16:58'
updated_date: '2026-11-18 19:44'
labels:
  - ui
  - security
dependencies:
  - TASK-57
documentation:
  - docs/mcp-tools-proposal.md
  - docs/mcp-implementation-notes.md
priority: high
ordinal: 4470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a desk page where a team member manages the AI assistants connected to their own account, so connecting one does not mean using the MCP admin console. Modelled on the Agents page in Memo Vault (pos-memory/app/views/pages/agents/).

It needs to: connect an assistant and show its access key once; list what is connected and when each was last used; let the member choose which MCP tools each assistant may use; revoke one immediately.

Minting and revoking use the MCP module's own commands (modules/mcp/commands/tokens/mint and revoke). The per-assistant tool choice cannot use the engine's per-token allowed_tools, because one assistant is usually several tokens: store the choice against the person plus the assistant's client id, as Memo Vault does, and enforce it in the support authorization policies.

The page is gated on the MCP module's mcp.tokens.manage permission, which is separate from the desk roles. Decide whether the desk admin role should imply it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A team member can connect an assistant and sees its key exactly once
- [x] #2 The list shows each connected assistant and when it was last used
- [x] #3 Switching a tool off for one assistant stops that assistant calling it, and leaves the member's other assistants alone
- [x] #4 Revoking stops the assistant on its next request
- [x] #5 A member only ever sees and revokes their own assistants
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: /support-desk/assistants — connect an assistant (key shown once), see what is connected and when it was last used, switch individual tools on or off per assistant, disconnect. Plus a desk-wide approval switch for admins. The desk reaches pos-module-mcp only through hook_support_mcp, so the module never references it and a desk without MCP has no page and no navigation entry.
Outcome: Verified end to end in a browser session: connect returns 302 and shows the key once; the panel lists all 11 switchable tools with 'waits for approval' on the six writes; switching two on stored the other nine as disabled; calling a switched-off tool with that assistant's key answers 'Unknown tool' while an enabled one works; disconnect kills the key (401). Named Assistants, not Agents, because an agent in this product is a person who answers tickets.
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
