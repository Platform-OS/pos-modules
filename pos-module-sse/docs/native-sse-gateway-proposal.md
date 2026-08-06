# A Native Streaming Gateway for Server-Sent Events

**Status:** Draft — for internal review, not yet scoped against a release
**Prior art:** the existing `/websocket` ActionCable gateway
**Scope:** platformOS core application (Rails) — not module-space
**Related:** `pos-module-websocket`, `pos-module-sse` (Liquid wrappers, pending this)
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

- **A or B from 3.3?** Depends on expected SSE concurrency relative to existing WebSocket concurrency, and on how much operational appetite there is for a fourth runtime. Worth a load estimate before committing.
- **Does auth need to survive across hours, not just page-load?** Session/CSRF tokens that expire mid-connection need a refresh path that doesn't require closing the stream — WebSocket connections likely already hit this; whatever answer exists there should transfer directly.
- **One mutation or two?** Whether `sse_send_message` is genuinely a new mutation or `channel_send_message` gains an "also fan out to any SSE subscribers of this room" behavior — the latter is less API surface, but couples the two transports more tightly at the schema level.
- **Per-instance connection ceiling?** Every plan in §3.3 still has a maximum concurrent-connections number somewhere; it needs to be measured, published, and enforced with a clear error rather than discovered in production.

## 6. Effort shape

| Area | Work | Size |
|---|---|---|
| Core: streaming endpoint | Controller + pub/sub wiring per 3.1–3.2, on whichever process from 3.3 is chosen | Medium–Large |
| Core: GraphQL mutation | `sse_send_message` (or extending `channel_send_message`) | Small |
| Core: infra | Proxy/LB config per 3.5, plus connection-count monitoring | Medium |
| Module: pos-module-sse rewrite | Delete schema/commands/queries/stream page; add `subscribed.liquid` convention | Small |
