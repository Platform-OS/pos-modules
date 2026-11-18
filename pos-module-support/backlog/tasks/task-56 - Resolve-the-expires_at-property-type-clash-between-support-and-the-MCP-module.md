---
id: TASK-56
title: Resolve the expires_at property type clash between support and the MCP module
status: To Do
assignee: []
created_date: '2026-11-18 17:36'
labels:
  - migration
dependencies:
  - TASK-48
priority: medium
ordinal: 10470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Installing pos-module-mcp beside pos-module-support makes platformos-check report: property 'expires_at' is declared as 'datetime' in modules/support/schema/team_invite.yml and as 'integer' in modules/mcp/public/schema/mcp_idempotency.yml. platformOS resolves a property's type by name across every schema, so filters on 'expires_at' see both declarations. The MCP module also declares it on mcp_token, mcp_pending_approval and mcp_oauth_code, all as unix seconds.

Today nothing is known to be broken: support only reads team_invite.expires_at as a property and compares it in Liquid (commands/team/accept_invite), and the MCP module's range filters are scoped to its own tables. The full unit suite passes apart from failures caused by an unconfigured instance. But the clash is real, it appears in CI as a warning for every desk that installs the MCP module, and the MCP module's approval expiry depends on integer range filters on this exact property name.

Decide whether to rename the support property (a migration) or to treat the warning as accepted, and record the decision either way.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A probe shows whether a range filter on expires_at behaves correctly for both tables when both schemas are deployed
- [ ] #2 Either the clash is removed, or a decision record states why it is accepted
- [ ] #3 platformos-check is clean on an instance with both modules, or the warning is explicitly allowed
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
