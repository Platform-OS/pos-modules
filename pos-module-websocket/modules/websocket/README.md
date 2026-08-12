# pos-module-websocket

Generic, reusable WebSocket (and SSE) pub/sub for platformOS. `modules/websocket` is the module. `app/` is a minimal demo ("Live Room") showing how to embed it, built with `user` (auth) and `common-styling` (UI).

## Status

platformOS's WebSocket support is native: the platform runs a gateway at `/websocket`, and Liquid integrates with it purely by convention (`views/partials/channels/<channel_name>/{subscribed,receive}.liquid` files, plus the `channel_send_message` GraphQL mutation for server-initiated pushes). This module does not reimplement RFC 6455 — it can't: Liquid pages are strictly request-in/response-out with no raw socket access and no way to block waiting on further client frames, which is exactly why platformOS itself put WebSocket support in the Rails layer rather than in Liquid. `pos-module-chat` already uses this native gateway, but bakes a `conversate` channel and a `notifications` channel directly into chat-specific code with no reusable shape. **This module generalizes that into one reusable channel** (`pos_websocket`) that any app can subscribe rooms on without adding new channel files.

The same gateway (AnyCable-go) can also terminate connections as [Server-Sent Events](https://docs.anycable.io/anycable-go/sse) instead of a WebSocket upgrade — same `Connect`/`Command` RPC, same `pos_websocket` channel, same `subscribed.liquid` authorization, no separate channel or module required. This used to be a separate module (`pos-module-sse`) that faked push with a Liquid page and a browser reconnect timer; it's gone now that the real transport is confirmed to reuse this module's channel contract unchanged — there was nothing left for a standalone module to own. See "Server-Sent Events transport" below and `docs/sse-transport.md` for the full contract, including the one hard limitation (SSE is read-only — no `receive`).

## Installation

```bash
pos-cli modules install websocket
```

## Setup

### 1. Add the init partial to your layout

```liquid
{% render 'modules/websocket/init' %}
```

This sets up `window.pos.modules.active.websocket` with `subscribe(roomId, callbacks)`, `subscribeSSE(roomId, callbacks)`, `send(roomId, payload)`, and `unsubscribe(roomId)`. `subscribe` and `subscribeSSE` join the exact same room over different transports (WebSocket vs. SSE) — pick per room based on whether that room needs two-way messaging (see "Server-Sent Events transport" below).

### 2. Register a room

Rooms don't exist until something creates them — nobody can join a `room_id` nobody has registered, and no default lets an arbitrary string double as an implicit public room. Registration is a normal command call:

```liquid
function room = 'modules/websocket/commands/rooms/find_or_create',
  room_id: 'chat-42',
  public: false,
  created_by: context.current_user.id
```

or, from the browser, `POST /websocket/rooms` with `room_id`/`public` form fields (see `views/pages/websocket/rooms.liquid`). It's idempotent — calling it again for the same `room_id` just returns the existing room; a room's visibility is fixed at creation and can't be flipped by re-registering it.

- **`public: true`** — any logged-in user may join or post to this room.
- **`public: false`** (default) — only registered members may. The creator is added automatically; add others with `commands/rooms/members/add` (`room_id`, `user_id`), or `POST /websocket/rooms/members` from the browser — the caller must already be authorized for the room themselves, so a stranger can't invite themselves in.

### 3. Join the room and exchange messages

```html
<script type="module">
  window.pos.modules.active.websocket.subscribe('chat-42', {
    received: function(data) { console.log('got', data); },
    connected: function() { console.log('joined'); },
    rejected: function() { console.log('not authorized for this room'); }
  });

  window.pos.modules.active.websocket.send('chat-42', { text: 'hello' });
</script>
```

`room_id` is otherwise a free-form string — this module has no opinion on what it means beyond the public/private/member bookkeeping above. Namespace it yourself the same way `pos-module-chat` does (`"chat-" + conversationId`, `"presence-" + pageSlug`, etc.) to keep unrelated features from colliding on the same room.

### 4. Push a message from the server

For server-initiated pushes (background jobs, event consumers, admin actions) where there's no client "sender" to relay through, call the broadcast command directly:

```liquid
function result = 'modules/websocket/commands/messages/broadcast',
  room_id: 'chat-42',
  payload: { "text": "Someone joined the room" }
```

Client-to-room messages don't need this — once `receive.liquid` lets a message through, ActionCable broadcasts it to the room automatically. This command is a trusted server-side call and isn't gated by room membership — the caller already decided to push.

## Server-Sent Events transport

Any room can be read over SSE instead of WebSocket — same channel, same authorization, same rooms, just a different transport for clients that only need to *read* a room:

```html
<script type="module">
  window.pos.modules.active.websocket.subscribeSSE('chat-42', {
    connected: function() { console.log('subscribed'); },
    rejected: function() { console.log('not authorized for this room'); },
    received: function(data) { console.log('got', data); }
  });
</script>
```

Three things are different enough from `subscribe()` to matter (full detail in `docs/sse-transport.md`):

1. **Read-only.** There is no confirmed way to invoke `receive.liquid` over this gateway. `subscribeSSE`'d rooms have no `send()` — `send(roomId, ...)` only works for rooms joined via `subscribe()`, because only those are tracked as WebSocket subscriptions internally. If a room needs a client to post into it, join it with `subscribe()` instead (or push server-side via `commands/messages/broadcast`, same as any other server-initiated push — see above).
2. **`?identifier=`, not `?channel=`.** This module's `subscribeSSE` builds and encodes the full `{channel, room_id}` identifier for you; the shorthand query-string form silently drops `room_id` server-side and isn't used here.
3. **`Origin` header must be proxied to RPC on the anycable-go side** for `same_origin?`-gated code paths to see it. This is infra config, not something toggled from Liquid or JS — see `docs/sse-transport.md`.

**Prerequisite:** the instance needs `sse_enabled: true` and the anycable-go gateway needs `--sse` (and a matching `--sse_path`, default `/events`) — both are core/platform configuration this module doesn't control. Until that's confirmed deployed, treat `subscribeSSE` as the contract to build against, not a guarantee.

## Authorization

**Private by default.** `views/partials/channels/pos_websocket/{subscribed,receive}.liquid` both delegate to `lib/queries/rooms/authorized.liquid`:

1. An unregistered `room_id` is never joinable by anyone.
2. A registered room with `public: true` is joinable by any logged-in user.
3. A registered room with `public: false` (the default) is joinable only by its creator and anyone explicitly added via `commands/rooms/members/add`.

This is real per-room access control backed by two small tables (`room`, `room_member`) — not a stand-in for it. What this module still can't do is domain-specific authorization it has no way to know about (e.g. "only participants of conversation 42," where "conversation 42" is a concept `pos-module-chat` owns, not this module) — apps needing that should override `subscribed.liquid`/`receive.liquid` via the platformOS **Module Override System**:

```
app/modules/websocket/public/views/partials/channels/pos_websocket/subscribed.liquid
app/modules/websocket/public/views/partials/channels/pos_websocket/receive.liquid
```

the same way `pos-module-chat`'s own `conversate/subscribed.liquid` implements its participant check inline.

## Events

| Event | Payload | Fired when |
|---|---|---|
| `websocket_message_received` | `{room_id, user_id, payload}` | A client message passes `receive.liquid` and is about to broadcast |
| `websocket_message_sent` | `{room_id, payload}` | `commands/messages/broadcast` pushes a server-initiated message |

Consume these via `lib/consumers/<event_name>/<consumer_name>.liquid` to persist messages, moderate content, or fan out to other systems — without touching this module's files.

## Dependencies

Declared in `modules/websocket/pos-module.json`:

- `core` ^2.1.9 — events (`modules/core/commands/events/publish`) and validations (`modules/core/validations/presence`)

No hard dependency on `user` or `common-styling`: authorization only needs `context.current_user`, which platformOS provides regardless of which auth module (if any) is installed, and this module ships no styled UI of its own — the demo app's UI is entirely its own concern.
