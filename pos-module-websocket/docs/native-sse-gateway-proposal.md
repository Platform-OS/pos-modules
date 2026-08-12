# A Native Streaming Gateway for Server-Sent Events

**Status:** Draft — for internal review, not yet scoped against a release.
Superseded in part: §3.3.1's bet that Option B was "already built" via
AnyCable-go's native SSE gateway was confirmed, and shipped — see
`docs/sse-transport.md` for the resulting contract. `pos-module-sse`, the
"pending this" module referenced below, no longer exists as a standalone
module: once the transport was confirmed to reuse this module's channel
contract unchanged, there was nothing left for it to own, so it was folded
into `pos-module-websocket` (`subscribeSSE` in `modules/websocket/init`).
The rest of this document is kept for historical context on why the
module-space polling fallback existed and what replaced it.
**Prior art:** the existing `/websocket` ActionCable gateway
**Scope:** platformOS core application (Rails) — not module-space
**Related:** `pos-module-websocket` (now also covers the SSE transport — see `docs/sse-transport.md`)
**Date:** 2026-08-05

Liquid pages render once and return — there is no primitive for holding a connection open and writing to it later. That's a hard constraint, not a gap in module code. Real Server-Sent Events, like WebSockets before them, can only be added as a core platform feature. This document specifies what that feature would need to look like, using the WebSocket gateway as the closest working precedent.

## 1. Problem

platformOS Liquid pages compile to one complete HTTP response per request; there is no `sleep`, no flush/streaming-output tag, and no way for a page to block waiting on data that doesn't exist yet. That's fine for ordinary pages. It rules out real SSE, because SSE's entire value proposition — a server writing new events down an already-open connection, minutes or hours apart, with no new request in between — requires exactly the thing Liquid can't do.

The module-space fallback (`pos-module-sse`) works around this by having the browser's native `EventSource` reconnect on a short timer (driven by the `retry:` field) and resume via `Last-Event-ID`. It is spec-legitimate and it ships today, but it is polling wearing SSE's wire format — every "connection" is actually a new HTTP request every one to a few seconds, for as long as a tab is open. Cost scales linearly with concurrent viewers regardless of whether anything is happening, which is the wrong cost model for anything with meaningful concurrent viewership.

## 2. Precedent: how `/websocket` solved the same problem

WebSocket support already answers "how does platformOS hold a connection open." It isn't a Liquid feature — it's a Rails/ActionCable process sitting beside the main app, with Liquid integrating purely by convention:

- A channel is just a pair of files, `views/partials/channels/<name>/{subscribed,receive}.liquid`, resolved by ActionCable at connect/message time.
- Server-initiated pushes go through one GraphQL mutation, `channel_send_message(channel_name, room_id, payload)`.
- The connection itself — accept, upgrade, framing, keepalive, teardown — is handled entirely below Liquid, in ActionCable's own evented runtime.

A native SSE gateway should be the same shape: Liquid contributes auth and payload conventions; the platform contributes the held-open connection.

## 3. Proposed architecture

### 3.1 A live streaming endpoint, outside the page-render pipeline

Rails already has the primitive: `ActionController::Live`. A controller action including it runs on its own thread, writes to `response.stream` as data becomes available, and closes the stream on disconnect — chunked transfer-encoding, no fixed response body up front.

```ruby
# sketch — app/controllers/sse_controller.rb
class SseController < ApplicationController
  include ActionController::Live

  def stream
    response.headers["Content-Type"] = "text/event-stream"
    channel = params[:channel]

    return head :forbidden unless authorized_for?(channel)

    subscription = RealtimeBus.subscribe(channel) do |event|
      response.stream.write(sse_format(event))
    end

    sleep 0.1 while !response.stream.closed?
  ensure
    subscription&.unsubscribe
    response.stream.close
  end
end
```

This is new surface area — it is not a Liquid page, and pages don't get an equivalent of it just by adding a front-matter flag, because Liquid's render step has no concept of "yield now, resume later."

### 3.2 Wake it via the pub/sub layer that already exists

The held-open thread from 3.1 should not poll the database. It should subscribe to the same Redis-backed pub/sub that `channel_send_message` already publishes into for WebSocket rooms — a "channel" in the SSE sense and a "room" in the ActionCable sense are the same concept wearing different names. Concretely: publishing an SSE event and broadcasting a WebSocket message could become the *same* internal call, with the gateway (WS vs. SSE) determined only by which kind of connection the client opened.

### 3.3 Concurrency model — this is the part that actually needs deciding

A thread held open for the lifetime of a connection doesn't scale on a normal Puma thread pool — N concurrent viewers means N threads permanently unavailable for ordinary request handling. This is very likely why WebSocket support runs in ActionCable's own evented process rather than inside normal Rails request handling, and the same reasoning applies here.

| Option | Shape | Trade-off |
|---|---|---|
| **A — piggyback on ActionCable** | Expose the cable process's existing pub/sub over a plain streamed HTTP response instead of a WS upgrade. Prior art exists elsewhere for "SSE transport on an ActionCable-shaped backend." | Reuses infrastructure and ops knowledge already in place for `/websocket`; couples two protocols to one process. |
| **B — dedicated evented process** | A small standalone service (e.g. Falcon/Iodine-style fiber or event-loop server) fed by the same Redis pub/sub, independent of both Puma and ActionCable. | Cleanest isolation and scaling story; one more process to deploy, monitor, and version alongside the app. |
| **C — thread-per-connection on Puma** | The naive version of 3.1, run as-is on the main app cluster. | No new infrastructure, but caps concurrent SSE viewers at (thread pool size − headroom for ordinary requests). **Not viable at scale.** |

Option A is the pragmatic default — it extends something that's already deployed, monitored, and understood, rather than introducing a fourth runtime to operate. Option B is the more scalable answer if SSE traffic ever needs to scale independently of WebSocket traffic.

### 3.3.1 Option B, already built: AnyCable-go's native SSE gateway

Before sketching a bespoke evented process for Option B, check [AnyCable-go's SSE support](https://docs.anycable.io/anycable-go/sse) — it is very likely a closer match than anything custom:

- It's the same Go binary that would front `/websocket` if platformOS's cable gateway is (or moves to) AnyCable-go, not a second runtime — enabled with one flag (`--sse` / `ANYCABLE_SSE=true`), serving a dedicated path (default `/events`, configurable via `--sse_path`).
- It reuses AnyCable's existing channel/subscription/broadcast model wholesale: clients subscribe via `channel=<Name>`, `identifier=<json>` (parameterized/room channels), or `stream=<name>` / `signed_stream=<name>`, and server-initiated broadcasts reach SSE subscribers through the exact same pub/sub fan-out that already serves WebSocket clients — i.e. `channel_send_message`-style pushes would need no SSE-specific publish path at all.
- Connection model is evented, not thread-per-connection — it doesn't reintroduce the Option C scaling ceiling.
- Client side is a plain native `EventSource` (`new EventSource(".../events?channel=ChatChannel")`), matching what `pos-module-sse` already exposes today — no protocol change visible to app code.
- It has its own reconnect/resume story (message IDs, `history_since` for reliable streams) that can likely replace the module's current `Last-Event-ID`/short-timer polling shim outright, and a `?raw=1` mode that strips protocol envelope events for simpler clients.

**Confirmed: `/websocket` already runs on AnyCable-go**, not vanilla ActionCable/Puma — `pos-module-chat`'s test suite (`tests/pages/channel.ts:30`) documents the `no_confirmation` verdict (a rejected `subscribed.liquid` surfaced as a silently-dropped connection rather than an explicit close frame) as "how AnyCable surfaces" that case, which is AnyCable-go-specific gateway behavior, not stock Rails ActionCable. So this isn't "which of A/B/C do we build" — the process Option B describes is already deployed, monitored, and taking production WebSocket traffic today. Turning on native SSE is a matter of enabling `--sse` on that existing gateway, routing `/sse/:channel` (or reusing `/events` directly) through it, and adding the `subscribed.liquid`-equivalent auth convention from §3.4. Options A and C are moot.

This is still core/infra work, not module-space — the flag, routing, and process config live in platformOS's core deployment, which this repo (`pos-modules`) has no access to or visibility into. Nothing here changes without whoever owns that gateway making the change.

### 3.4 The Liquid-facing convention

Mirroring the WebSocket shape directly:

- A native route, e.g. `GET /sse/:channel`, handled by the gateway from 3.1 — not a Liquid page.
- An auth convention file per channel: `views/partials/sse_channels/<channel>/subscribed.liquid`, echoing `'true'`/`'false'` exactly like the WebSocket convention does.
- A publish-side GraphQL mutation, e.g. `sse_send_message(channel_name, room_id, payload)`, symmetric with `channel_send_message` — plausibly the very same underlying mutation, fanning out to both transports for a given room.

Once this exists, `pos-module-sse` collapses to the same shape `pos-module-websocket` already has today: no schema, no stored event log, no polling — just the convention files and a thin JS wrapper around `EventSource`, receiving a real push the instant `sse_send_message` fires.

### 3.5 Infrastructure in front of the app

- Reverse proxies/load balancers need response buffering disabled for this route (nginx's `X-Accel-Buffering: no` or equivalent) — a buffering proxy defeats the entire point by holding the first chunk until the buffer fills or the connection ends.
- No fixed idle-read timeout on this route — a quiet-but-open SSE connection looks identical to a stalled one from a generic timeout's perspective.
- Load balancer session affinity isn't required (pub/sub fan-out means any node can serve any subscriber), but connection-count-based (not just request-rate-based) autoscaling triggers become relevant once viewers can stay connected for hours.

### 3.6 Disconnect handling

`ActionController::Live` exposes `response.stream.closed?` for exactly this — detect the client navigating away or closing the tab, unsubscribe from the pub/sub channel, and free the thread/fiber. Skipping this leaks a subscription (and, under option C, a thread) per abandoned tab indefinitely.

## 4. Migration path for the modules

No breaking change to either module's public API is required:

- `pos-module-websocket` is unaffected — it already talks to the real gateway.
- `pos-module-sse`'s `window.pos.modules.sse.connect(channel, callbacks)` signature stays the same from the app developer's side. Internally, `views/pages/sse/stream.liquid` and the `sse_event` schema/queries/commands are deleted outright and replaced by the native route and `subscribed.liquid` convention from 3.4 — the module becomes thinner, not more complex.
- Until this ships, the module's README should keep stating plainly that it's a polling-based fallback, not real push — see §5 for the cost of leaving that as the permanent state.

## 5. Open questions

- **Does auth need to survive across hours, not just page-load?** Session/CSRF tokens that expire mid-connection need a refresh path that doesn't require closing the stream — WebSocket connections likely already hit this; whatever answer exists there should transfer directly.
- **One mutation or two?** Whether `sse_send_message` is genuinely a new mutation or `channel_send_message` gains an "also fan out to any SSE subscribers of this room" behavior — the latter is less API surface, but couples the two transports more tightly at the schema level.
- **Per-instance connection ceiling?** Every plan in §3.3 still has a maximum concurrent-connections number somewhere; it needs to be measured, published, and enforced with a clear error rather than discovered in production.

## 6. Effort shape

Since `/websocket` is confirmed already on AnyCable-go (§3.3.1), this is the relevant path — the custom-build sizing from §3.1–3.3 (Options A/C) is superseded and not repeated here.

| Area | Work | Size |
|---|---|---|
| Core: streaming endpoint | Enable `--sse` on the existing AnyCable-go gateway, route `/sse/:channel` (or expose `/events` directly) | Small |
| Core: GraphQL mutation | `sse_send_message`, or extend `channel_send_message` to also fan out over AnyCable-go's existing pub/sub | Small |
| Core: infra | Proxy/LB config per 3.5, plus connection-count monitoring | Small–Medium |
| Module: pos-module-sse rewrite | Delete schema/commands/queries/stream page; add `subscribed.liquid` convention | Small |
