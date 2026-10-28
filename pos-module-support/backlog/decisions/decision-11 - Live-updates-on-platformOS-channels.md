---
id: decision-11
title: Live updates on platformOS channels, not pos-module-websocket
date: '2026-10-28'
status: accepted
---
## Context and decision

D-13 planned live updates and presence on pos-module-websocket rooms. At TASK-0, `pos-cli modules install` failed with: `Module "websocket" not found in the registry`. pos-module-websocket is in the monorepo but has not been published to the marketplace, so it cannot be a dependency.

Decision: use platformOS's built-in WebSocket channels (`views/partials/channels/<channel>/{subscribed,receive}.liquid`), the same way pos-module-chat does. Use channels `support_queue` (per department) and `support_ticket` (per ticket, for presence). The permission check runs in the channel's `subscribed` handler (chat PR #86 pattern).

## Consequences

TASK-17 follows pos-module-chat's channel files instead of the websocket module's rooms API. If pos-module-websocket is published later, switching is local to TASK-17.
