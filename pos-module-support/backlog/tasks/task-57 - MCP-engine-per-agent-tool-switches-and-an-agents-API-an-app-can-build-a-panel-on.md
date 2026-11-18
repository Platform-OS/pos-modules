---
id: TASK-57
title: >-
  MCP engine: per-agent tool switches, and an agents API an app can build a
  panel on
status: Done
assignee: []
created_date: '2026-11-18 18:50'
updated_date: '2026-11-18 19:44'
labels:
  - security
dependencies: []
documentation:
  - docs/mcp-engine/README.md
priority: high
ordinal: 11470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Agents panel (TASK-50) needs two things the MCP engine does not offer, and both belong in the engine rather than in this module.

1. Per-agent tool switches. The engine narrows the served tool set with mcp_token.allowed_tools, which is PER TOKEN. One assistant normally holds several tokens, because an app that refreshes its OAuth token gets a new one each time, so a choice stored against a token does not survive a refresh. The switch has to follow the agent (agent.client_id, which resolve_principal always sets: the OAuth client id, else the token label, else the principal id). Store it per user plus client_id, apply it in registry/resolve_tool and queries/registry/for_agent so a switched-off tool is both unlistable and uncallable. Store the exclusion, not the permission, so a tool added later is on until someone switches it off. Memo Vault implements this app-side today, which is the evidence that it is a real gap.

2. An agents API. An app needs to list a person's assistants grouped by client_id with their last-used time, mint one, and revoke one — the grouping and the revoke-every-token-of-this-agent loop are engine concerns, not something each app should re-derive from the token table.

An earlier attempt put both in pos-module-support (a module table plus a check inside the support authorization policies). That was backed out: it duplicates engine responsibility, and the support module may not reference modules/mcp at all under this repo's module-boundary gate.

Work in modules/mcp in this repo (the master development copy) and port to pos-module-mcp, as with docs/mcp-engine/approval-switch.patch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A tool switched off for an assistant is absent from tools/list for that assistant and refused on tools/call
- [x] #2 The choice survives an OAuth token refresh, so it follows the assistant and not one token
- [x] #3 A tool added to the desk after the choice was made is available until someone switches it off
- [x] #4 An app can list a person's assistants, mint one and revoke one through the engine, without reading the token table itself
- [x] #5 Ported to pos-module-mcp with README and CHANGELOG entries
<!-- AC:END -->











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
