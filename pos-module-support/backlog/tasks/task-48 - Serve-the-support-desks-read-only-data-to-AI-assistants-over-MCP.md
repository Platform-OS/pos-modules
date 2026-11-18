---
id: TASK-48
title: Serve the support desk's read-only data to AI assistants over MCP
status: Done
assignee: []
created_date: '2026-11-18 16:58'
updated_date: '2026-11-18 17:44'
labels:
  - iteration-2
  - security
dependencies: []
documentation:
  - docs/mcp-tools-proposal.md
  - docs/mcp-implementation-notes.md
priority: high
ordinal: 2470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add five read-only MCP tools so an assistant connected by a team member can look up desk data instead of the member pasting ticket threads into a chat window: support_search_tickets, support_read_ticket, support_find_customer, support_queue_overview, support_saved_replies.

The tools live in the module (modules/support/public/lib/mcp/) and call the existing query wrappers, so department scope and role permissions come from modules/support/can/desk and queries/tickets/scope rather than from a second copy of those rules. Identity runs principal.user_id -> modules/user/queries/profiles/find -> queries/team_members/find; MCP never creates a team member, so an assistant can only act for someone who already has desk access.

pos-module-mcp reads its registry, policies and instructions from fixed app paths, so the host app needs three small delegating files. Write them by hand here as the reference copy; automating them in the install generator is a separate task.

pos-module-mcp stays out of dependencies (devDependencies only): with no MCP module installed the files are inert.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Five read tools are served over /mcp and return desk data for a connected team member
- [x] #2 An agent sees only the departments their own desk role lets them see; a manager and an agent on the same instance get different results
- [x] #3 A person with no active team_member record is refused, and MCP never creates one
- [x] #4 Results are a named projection, not the raw ticket record, and match the tool's declared output_schema
- [x] #5 Tools are inert on a desk without pos-module-mcp installed
- [x] #6 The host app shim (registry, policy, instructions) is documented in the README
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Five read-only MCP tools under modules/support/public/lib/mcp (search_tickets, read_ticket, find_customer, queue_overview, saved_replies), a shared actor helper and desk_read policy, the module's tool registry and connection instructions, plus the three-file app shim in the example host and a mcp.tokens.manage grant. README gained an 'AI assistants (MCP)' section; SKILL.md one line. mcp is a devDependency only.
Outcome: Verified live on ps over HTTP with a minted token: initialize returns the desk instructions, tools/list serves all five (none excluded by the manifest meta-schema), and each tool returns its declared projection. Department scope holds end to end — an agent's queue overview and search return only their departments, read_ticket on another department answers 'No ticket number N that you can read', and a customer with two tickets shows the one ticket the agent may read. A valid token for someone with no team_member record gets -32001 Forbidden; an out-of-enum argument is refused before the handler runs. app/lib/test/support/mcp_tools_test.liquid (26 assertions) passes, and bites: widening the member's role to manager fails exactly the three scope assertions. platformos-check and ci-static clean apart from the pre-existing expires_at clash (TASK-56). All probe users, tokens, memberships and tickets were removed from ps afterwards.
Next: The Agents panel (TASK-50) so people can connect and revoke without the MCP console; automating the app shim in the install generator (TASK-49). Write tools stay unbuilt (TASK-51 to TASK-53).
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
