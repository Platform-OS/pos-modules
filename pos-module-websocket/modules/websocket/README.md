# pos-module-websocket

Generic, reusable WebSocket (and Server-Sent Events) pub/sub for platformOS. Register a room, join it from the browser, exchange messages — all through one shared channel, instead of hand-rolling a new Action Cable channel and a pair of `subscribed`/`receive` partials for every feature that needs a live room.

This module follows the [platformOS DevKit best practices](https://documentation.platformos.com/developer-guide/modules/platformos-modules) and includes the [core module](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-core) as a dependency, enabling you to implement patterns such as [Commands](https://github.com/Platform-OS/pos-modules/blob/master/pos-module-core/README.md#commands--business-logic) and [Events](https://github.com/Platform-OS/pos-modules/blob/master/pos-module-core/README.md#events).

Before using the module, we recommend reading the official platformOS documentation on [WebSockets](https://documentation.platformos.com/use-cases/using-websockets) — this module doesn't reimplement any of that, it just gives you one ready-made channel to build on.

## Status

platformOS's WebSocket support is native: the platform runs a gateway at `/websocket`, and Liquid integrates with it purely by convention (`views/partials/channels/<channel_name>/{subscribed,receive}.liquid` files, plus the `channel_send_message` GraphQL mutation for server-initiated pushes). This module does not reimplement RFC 6455 — it can't: Liquid pages are strictly request-in/response-out with no raw socket access and no way to block waiting on further client frames, which is exactly why platformOS itself put WebSocket support in the Rails layer rather than in Liquid.

[`pos-module-chat`](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-chat) already uses this native gateway, but bakes a `conversate` channel and a `notifications` channel directly into chat-specific code, with no reusable shape. **This module generalizes that into one reusable channel** (`pos_websocket`) that any app can register rooms on and subscribe to, without adding new channel files.

The same gateway (AnyCable-go) can also terminate connections as [Server-Sent Events](https://docs.anycable.io/anycable-go/sse) instead of a WebSocket upgrade — same `Connect`/`Command` RPC, same `pos_websocket` channel, same `subscribed.liquid` authorization, no separate channel or module required. See [Server-Sent Events transport](#server-sent-events-transport) below for the full contract, including the one hard limitation (SSE is read-only — no `receive`).

## Installation

The platformOS Websocket Module is distributed via the [platformOS Partner Portal Modules Marketplace](https://partners.platformos.com/marketplace).

### Prerequisites

Before installing the module, ensure that you have [pos-cli](https://github.com/mdyd-dev/pos-cli#overview) installed. This tool is essential for managing and deploying platformOS projects.

The module is fully compatible with [platformOS Check](https://github.com/Platform-OS/platformos-lsp#platformos-check----a-linter-for-platformos), a linter and language server that supports any IDE with Language Server Protocol (LSP) integration. For Visual Studio Code users, you can enhance your development experience by installing the [VSCode platformOS Check Extension](https://marketplace.visualstudio.com/items?itemName=platformOS.platformos-check-vscode).

### Installation steps

```bash
pos-cli modules install websocket
```

This installs the module along with its dependency ([pos-module-core](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-core)) and updates or creates the `app/pos-modules.json` file in your project directory to track module configurations.

No hard dependency on `user` or `common-styling`: room authorization only needs `context.current_user`, which platformOS provides regardless of which auth module (if any) is installed, and this module ships no styled UI of its own.

## Setup

### Quick start with the `install` generator

The fastest way to wire things up is the bundled `install` generator. It asks whether to add the init partial to your layout(s), and whether to register a starter room via a migration on an environment — and does either (or both) for you if you say yes:

```bash
pos-cli generate run modules/websocket/generators/install
```

Prefer to do it by hand, or need to understand what it's doing under the hood? The manual steps are below.

### 1. Render the init partial in your layout

```liquid
{% render 'modules/websocket/init' %}
```

Render this once per page, in `<head>` or just before `</body>`. It sets up `window.pos.modules.active.websocket`, a thin wrapper around both ways platformOS can push into the `pos_websocket` channel's rooms:

| Method | Transport | Description |
|---|---|---|
| `subscribe(roomId, callbacks)` | WebSocket, via [`@rails/actioncable`](https://www.npmjs.com/package/actioncable) (loaded from a CDN as an ES module — no npm bundling required) | Two-way: also supports `send()`. |
| `subscribeSSE(roomId, callbacks)` | AnyCable-go's native SSE gateway, a plain `EventSource` under the hood | Read-only: there is no working way to invoke a channel's `receive` partial over this transport — use `commands/messages/broadcast` for server-initiated pushes into a room an SSE client is reading. |
| `send(roomId, payload)` | — | Only works for rooms joined via `subscribe()` — SSE-subscribed rooms have no `send()`. |
| `unsubscribe(roomId)` | — | Closes whichever transport `roomId` was joined with. |

`callbacks` may implement `received`, `connected`, `disconnected`, and `rejected`. Both transports drive the exact same `Connect`/`Command` RPC server-side and therefore the exact same `pos_websocket` channel and room authorization — picking one over the other is purely a client concern, and subscriptions are keyed by `room_id` regardless of transport, so a single page can hold several concurrent room subscriptions at once, mixing transports freely.

The partial accepts two optional params if your instance's WebSocket/SSE gateway isn't mounted at the defaults:

```liquid
{% render 'modules/websocket/init', websocket_url: '/websocket', events_url: '/events' %}
```

### 2. Register a room

Rooms don't exist until something creates them — nobody can join a `room_id` nobody has registered, and no default lets an arbitrary string double as an implicit public room. Registration is a normal command call:

```liquid
function room = 'modules/websocket/commands/rooms/find_or_create',
  room_id: 'chat-42',
  public: false,
  created_by: context.current_user.id
```

or, from the browser, `POST /websocket/rooms` with `room_id`/`public` form fields (see [HTTP endpoints](#http-endpoints)). It's idempotent — calling it again for the same `room_id` just returns the existing room; a room's visibility is fixed at creation and can't be flipped by re-registering it.

- **`public: true`** — any logged-in user may join or post to this room.
- **`public: false`** (default) — only registered members may. The creator is added automatically; add others with `commands/rooms/members/add` (`room_id`, `user_id`), or `POST /websocket/rooms/members` from the browser — the caller must already be authorized for the room themselves, so a stranger can't invite themselves in.

`room_id` is otherwise a free-form string — this module has no opinion on what it means beyond the public/private/member bookkeeping above. Namespace it yourself the same way `pos-module-chat` does (`"chat-" + conversationId`, `"presence-" + pageSlug`, etc.) to keep unrelated features from colliding on the same room.

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

Client-to-room messages don't need any server-side broadcast call — once `receive.liquid` lets a message through, Action Cable broadcasts it to the room automatically.

### 4. Push a message from the server

For server-initiated pushes (background jobs, event consumers, admin actions) where there's no client "sender" to relay through, call the broadcast command directly:

```liquid
function result = 'modules/websocket/commands/messages/broadcast',
  room_id: 'chat-42',
  payload: { "text": "Someone joined the room" }
```

This command is a trusted server-side call and isn't gated by room membership — the caller already decided to push.

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

Three things are different enough from `subscribe()` to matter:

1. **Read-only.** There is no confirmed way to invoke `receive.liquid` over this gateway. `subscribeSSE`'d rooms have no `send()`. If a room needs a client to post into it, join it with `subscribe()` instead (or push server-side via `commands/messages/broadcast`).
2. **The full identifier, not a channel shorthand.** `subscribeSSE` builds and encodes the full `{channel, room_id}` identifier for you. The gateway also accepts a `?channel=...` shorthand, but that form carries only the channel name and silently drops `room_id`, so it isn't used here.
3. **`Origin` header must be proxied to RPC on the anycable-go side** for `same_origin?`-gated code paths to see it. This is infra config, not something toggled from Liquid or JS.

**Prerequisite:** the instance needs `sse_enabled: true` in `app/config.yml` (see the example app's `app/config.yml`), and the anycable-go gateway needs `--sse` (and a matching `--sse_path`) — both are core/platform configuration this module doesn't control. Until that's confirmed deployed on your instance, treat `subscribeSSE` as the contract to build against, not a guarantee.

## Authorization

**Private by default.** `views/partials/channels/pos_websocket/{subscribed,receive}.liquid` both delegate to `lib/queries/rooms/authorized.liquid`:

1. An unregistered `room_id` is never joinable by anyone.
2. A registered room with `public: true` is joinable by any logged-in user.
3. A registered room with `public: false` (the default) is joinable only by its creator and anyone explicitly added via `commands/rooms/members/add`.

This is real per-room access control backed by two small tables (`room`, `room_member`) — not a stand-in for it. What this module still can't do is domain-specific authorization it has no way to know about (e.g. "only participants of conversation 42," where "conversation 42" is a concept `pos-module-chat` owns, not this module) — apps needing that should override `subscribed.liquid`/`receive.liquid` by [overwriting a module file](https://documentation.platformos.com/developer-guide/modules/modules#overwriting-a-module-file):

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

## API reference

### Commands

| Command | Params | Description |
|---|---|---|
| `modules/websocket/commands/rooms/find_or_create` | `room_id` (required), `public` (optional, default `false`), `created_by` (required, user id) | Registers a room, or idempotently returns the existing one. Private rooms automatically get `created_by` added as their first member. |
| `modules/websocket/commands/rooms/members/add` | `room_id` (required), `user_id` (required) | Adds a member to a room. Idempotent — adding an existing member is a no-op. |
| `modules/websocket/commands/messages/broadcast` | `room_id` (required), `payload` (required, JSON-serializable) | Sends a message to every current subscriber of `room_id`, for server-initiated pushes. Publishes `websocket_message_sent`. |

### Queries

| Query | Params | Returns |
|---|---|---|
| `modules/websocket/queries/rooms/find` | `room_id` | `{id, created_at, room_id, public, created_by}`, or `null` if unregistered |
| `modules/websocket/queries/rooms/members/exists` | `room_id`, `user_id` | `true`/`false` |
| `modules/websocket/queries/rooms/authorized` | `room_id`, `user_id` | `true` if `user_id` may join/post to `room_id` (shared by `subscribed.liquid` and `receive.liquid`, so the two can't drift apart) |

### HTTP endpoints

The table below outlines the routes provided for registering rooms and members from the browser:

| HTTP method | slug | page file path | description |
|---|---|---|---|
| POST | `/websocket/rooms` | `modules/websocket/public/views/pages/websocket/rooms.liquid` | Registers a room (`room_id`, `public`), or idempotently returns it if it already exists. The current user becomes the creator. |
| POST | `/websocket/rooms/members` | `modules/websocket/public/views/pages/websocket/rooms/members.liquid` | Adds a user (`user_id`) to a private room's (`room_id`) member list — an invite. The caller must already be authorized for the room themselves. |

Both endpoints require a signed-in user and return JSON (`{"ok":true,...}` / `{"ok":false,"error"|"errors":...}`).

## Example application

We recommend creating a [new Instance](https://partners.platformos.com/instances/new) and deploying this module as an application to get a better understanding of the basics and the functionality this module provides. When you install the module using `pos-cli modules install websocket`, only the contents of `modules/websocket` will be available in your project. The `app` directory serves as an example of how you could incorporate the Websocket Module into your application — a small "Live Room" demo built with `user` (auth) and `common-styling` (UI).

When analyzing the code in the `app` directory, pay attention to the following files:

* **`app/config.yml`** — sets `sse_enabled: true` (required for the SSE transport) and lists `websocket` in `modules_that_allow_delete_on_deploy`.
* **`app/views/layouts/application.liquid`** — renders `modules/websocket/init`.
* **`app/views/pages/websocket/join.liquid`** and **`app/views/pages/websocket/demo.liquid`** — register a room (`modules/websocket/commands/rooms/find_or_create`) and render the live room UI, switching between the WebSocket and SSE transport via a `?transport=sse` query param.
* **`app/views/partials/websocket/demo.liquid`** — the room UI itself.

Both demo pages are gated behind the `websocket.demo` permission via `modules/user/helpers/can_do_or_unauthorized`. Grant it to whichever role(s) should be able to reach `/websocket/demo` by [overwriting](https://documentation.platformos.com/developer-guide/modules/modules#overwriting-a-module-file) `app/modules/user/public/lib/queries/role_permissions/permissions.liquid`, e.g.:

```
mkdir -p app/modules/user/public/lib/queries/role_permissions
cp modules/user/public/lib/queries/role_permissions/permissions.liquid app/modules/user/public/lib/queries/role_permissions/permissions.liquid
```

and add `"websocket.demo"` to the role(s) you want to have access (e.g. `authenticated`).

## Managing Module Files

The default behavior of modules is that **the files are never deleted**. It is assumed that developers might not have access to all of the files, and thanks to this feature, they can still overwrite some of the module's files without breaking them. To have files deleted on deploy instead, ensure your `app/config.yml` includes the module (and its dependencies) in the list `modules_that_allow_delete_on_deploy`:

```yaml
modules_that_allow_delete_on_deploy:
  - core
  - websocket
```

## Dependencies

Declared in `modules/websocket/pos-module.json`:

- `core` `^2.1.9` — events (`modules/core/commands/events/publish`) and validations (`modules/core/validations/presence`)
