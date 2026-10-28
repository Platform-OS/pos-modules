# 11 — Iterations 2–5 (design to the level the MVP must not block)

The MVP data model already holds every column these need (03). Each iteration gets its own backlog parent task when it starts; this file fixes the technical approach.

## Iteration 2 — GitHub status loop (GH-1..GH-9)

- **Auth**: a GitHub App per GitHub organization (`projects_v2_item` webhooks exist only at organization level). Store `app_id`, private key (constant), installation id, project node id, Status field id and option ids in settings.
- **Installation token**: JWT signed with the App private key (`jwt_encode` with RS256 — verify the filter supports RS256 in a spike) → `POST /app/installations/:id/access_tokens`.
- **Create/link** (GraphQL API v4 via `api_call_send`): `createIssue` → `addProjectV2ItemById` → `updateProjectV2ItemFieldValue` (three calls; they cannot be combined).
- **Webhook**: `pages/api/support/github.liquid` (`slug: api/support/github/:secret`), verify `X-Hub-Signature-256` with `compute_hmac: secret, 'sha256'` over the raw body. **Spike**: confirm the raw request body is available (pos-module-mcp found JSON bodies arrive parsed in `context.params`, raw bytes unavailable); if not, rely on the secret path segment plus re-fetching the item state from GitHub before acting (never trust the payload's status).
- **Reconciliation**: hourly sweep re-reads Status for every open link (preview webhooks can change).
- **Status map + customer emails**: `notification_log` table (ticket_id, stage, sent_at, approved_by) guarantees one email per ticket per stage; debounce 10 minutes; backward moves send nothing; per-stage auto/approve switch; copy never contains dates.
- UI per prototype screen "Engineering loop".

## Iteration 3 — Chat widget, portal, agent offline mode (CH-1..CH-8, PW-7)

- Widget: a module partial (`modules/support/widget`) for platformOS hosts and a JS snippet for other domains; identity from the host session or an HS256 JWT (`jwt_decode` with the shared secret constant) carrying `external_id`, `name`, `email`, `email_verified`, `exp`.
- Transport: the module's platformOS channel, room `chat-<ticket_id>` (two-way) for live chat; when no agent replies within the configured time, the conversation continues by email (same ticket, `channel: chat`).
- Portal: `/support` pages (outside `/admin`), contact-scoped; organization sharing via `organization.share_tickets`.
- Offline: service worker caches the app shell and the last 50 opened tickets (JSON endpoints), queues replies in IndexedDB and sends them on reconnect with the CSRF token refreshed first.

## Iteration 4 — AI first responder and copilot through pos-module-mcp (AI-1..AI-9)

Architecture: **pos-module-mcp** is the governed gateway; the support module ships the Layer-2 tools.

- The support module ships tool partials under `modules/support/public/lib/mcp/tools/<name>/{manifest,call}.liquid` and a policy `modules/support/public/lib/mcp/policies/support_member.liquid`, which allows a call only when the principal's profile has an active `team_member` with a role that grants the permission, using the same `can/desk` as the UI (D-24); host roles never count. The install generator adds the registry lines to the host's `app/lib/mcp/registry.liquid` (the MCP engine only serves registered tools). Generate drafts with `pos-cli generate run modules/mcp/generators/tool <name> --op command --command modules/support/commands/<…>` so every tool wraps the same build/check/execute commands the UI uses.
- Tools:

| Tool | Mutating | Approval | Wraps |
|---|---|---|---|
| `support_search_tickets` | no | no | `queries/tickets/search` (department-scoped by principal) |
| `support_get_ticket` | no | no | `queries/tickets/find` + `messages/for_ticket` (internal notes included only for agent principals) |
| `support_draft_reply` | yes (creates a draft note) | no | `commands/messages/create_note` with `kind: draft` |
| `support_send_reply` | yes | **yes** (until accuracy gate passes) | `commands/messages/create_reply` |
| `support_set_priority` / `support_set_department` | yes | no | commands |
| `support_link_github_issue` | yes | no | `commands/escalation_links/create` |

- First responder in chat: an LLM (Anthropic API by default; model id configurable) runs with these tools plus a knowledge retrieval tool over documentation pages and solved tickets marked "use for AI" (`resources` of pos-module-mcp, `resources.expose_markdown_pages` for docs). The AI user is a platformOS user with role `support_ai`; tickets it handles have `assignee_id` = that user and `ai_state = handling`.
- Every call is attested in the MCP ledger (who, what, inputs hash, result); `ai_run` in our module links ledger entries to tickets for the ticket sidebar.
- Approval gate: customer-facing sends wait in the MCP approval queue; the ticket page shows "AI reply waiting for approval" with Approve/Edit/Reject that call the MCP admin endpoints.
- Test mode (AI-5): an eval set built from 200 solved tickets, run with the MCP eval harness (`/mcp-admin/eval`).

## Iteration 5 — AI triage to GitHub (TR-1..TR-5)

- Tools `support_triage_ticket` (read-only: extracts repro steps, environment, missing fields) and `support_draft_github_issue` (mutating, **requires_approval: true**) registered the same way.
- Code reading: the triage agent gets read-only repository access through the GitHub App (Contents: read) per department-configured repositories; it never creates pull requests.
- Follow-up questions to the customer are drafted as `support_draft_reply` and approved by the agent (max 2 rounds).
- Developer ratings (useful / partly / wrong) stored on `escalation_link` and reported per department; they gate wider rollout.
