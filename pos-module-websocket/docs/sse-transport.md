# Server-Sent Events (SSE) transport

> Status: backend gating landed (`Instance#sse_enabled`, gated in
> `ApplicationCable::Connection`); the anycable-go side is not yet confirmed
> deployed with the settings this document depends on. Treat this as the
> contract to enforce once that infra lands, not as "this works in
> production today."

AnyCable-go can terminate [Server-Sent Events](https://docs.anycable.io/anycable-go/sse)
directly (`--sse`, default path `/events`), as an alternative to the WebSocket
upgrade described in [the module README](../modules/websocket/README.md).
Confirmed by a local spike (real RPC server + real `anycable-go --sse`, no
stubs): an SSE connection drives the **exact same** `Connect`/`Command` RPC
calls as a WebSocket one. That means everything in the module README — the
`subscribed`/`receive` partial contract, the `subscription_error` payload,
the room identifier format, `websockets_require_subscribed_partial` — applies
**unchanged** over SSE. `WebNotificationsChannel` required zero code changes
to work over this transport.

Three things are different enough to catch developers and infra off guard.

## 1. Use `?identifier=`, not the `?channel=` shorthand

anycable-go accepts two query-string forms for identifying a subscription:

```
# BROKEN for any per-room channel — only `channel` survives, room_id is
# silently dropped from the identifier the server actually receives.
GET /events?channel=chatting&room_id=room1

# CORRECT — the full identifier, URL-encoded JSON.
GET /events?identifier=%7B%22channel%22%3A%22chatting%22%2C%22room_id%22%3A%22room1%22%7D
# i.e. identifier={"channel":"chatting","room_id":"room1"}
```

Verified directly against the RPC log: with the shorthand, the `subscribe`
command Rails receives is `{"channel":"chatting"}` — `room_id` is gone, and
every client that uses the shorthand ends up sharing one `room_id: nil` room
instead of separate rooms. Always build the full `identifier` JSON
client-side. `pos-module-websocket`'s `modules/websocket/init` partial
(`subscribeSSE`) does this for you.

## 2. Same-origin detection needs `Origin` proxied to RPC

`same_origin?` (see [the module README](../modules/websocket/README.md)) depends on `env['HTTP_ORIGIN']`.
anycable-go only proxies the `Cookie` header to the RPC server by default
(`--headers` default: `"cookie"`). Without `--headers=cookie,origin` (or
equivalent) in the anycable-go config, `HTTP_ORIGIN` is **always empty** for
SSE connections, so `same_origin?` is always false — every channel relying on
the same-origin default-open fallback silently becomes fail-closed for SSE
clients, instance flags notwithstanding. **This must be confirmed in the
anycable-go deployment config before enabling `sse_enabled` on any real
instance** — and since the flag is shared with the WebSocket listener on most
setups, it's worth double-checking it's already there for WS too.

## 3. Read-only: `receive` partials do not work over SSE

SSE is server→client only. There is no confirmed, working way to invoke a
channel's `receive` action (the `perform`/two-way path used e.g. for chat
send) over anycable-go's `--sse` endpoint in the version spiked against
(anycable-go 1.6.16): a plain POST to `/events` opens an unrelated duplicate
subscription and ignores the body; a POST shaped like an Action Cable command
envelope raised an internal error inside anycable-go's own middleware. Until
this is resolved (possibly via AnyCable's separate Durable Streams `--ds`
feature, not yet investigated), **channels that define a `receive` partial
must keep using WebSocket** — offer SSE only for broadcast/read-only
channels.

`pos-module-websocket`'s SSE-side API reflects this: `subscribeSSE()` ships
no matching `send()` — only `subscribe()` (the WebSocket path) does.
Client-initiated actions on a channel still need a WebSocket subscription
for the write half; SSE is only ever the read half.

## Enabling it

- `Instance#sse_enabled` (default `false`), settable via `app/config.yml`
  like the other `websockets_*` flags.
- Enforced in `ApplicationCable::Connection#validate_sse_enabled`, which gates
  on the request path (`SSE_PATH = "/events"`, must match anycable-go's
  `--sse_path`) — there is no other field in the RPC env that distinguishes
  an SSE-originated connection from a WebSocket one.

## Backend reference

- Gating: `app/channels/application_cable/connection.rb`
  (`sse_request?`, `validate_sse_enabled`, `SSE_PATH`)
- Feature flag: `app/models/instance.rb` (`sse_enabled`)
- Deploy config: `app/services/app_builder/converters/instance_config_converter.rb`
- Tests: `test/action_cable/connection_test.rb` ("SSE transport gating" context)
- Channel contract this transport reuses unchanged: [the module README](../modules/websocket/README.md)

## Module reference

This used to be a separate module (`pos-module-sse`) that faked push with a
Liquid page and a browser reconnect timer, before this transport was
confirmed to reuse `pos-module-websocket`'s channel contract unchanged.
There was nothing left for a standalone module to own, so it was folded in:

- Client wrapper: `modules/websocket/public/views/partials/init.liquid`
  (`window.pos.modules.websocket.subscribeSSE`, alongside the WebSocket
  `subscribe`/`send`/`unsubscribe` — see the module README's "Server-Sent
  Events transport" section)
- Demo: `pos-module-websocket/app/`'s "Live Room" demo can join a room via
  either transport; server-initiated pushes for SSE-read rooms go through
  the same `modules/websocket/commands/messages/broadcast` used for any
  other server-initiated push (see gotcha 3 above — there is no
  client-to-room path over SSE itself).
