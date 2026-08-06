# pos-module-sse

Server-Sent Events for platformOS, implementing the [WHATWG spec](https://html.spec.whatwg.org/multipage/server-sent-events.html) in pure Liquid. `modules/sse` is the module. `app/` is a minimal demo ("Activity Feed") showing how to embed it, built with `user` (auth) and `common-styling` (UI).

## Status

**This is genuinely pure Liquid — no platform-specific realtime gateway involved**, unlike `pos-module-websocket`. A platformOS page can set `response_headers: {"Content-Type": "text/event-stream"}` and print spec-formatted output, which is all SSE strictly requires on the wire.

### Known limitation

**No held-open connection.** platformOS/Liquid has no `sleep`, flush, or streaming-output primitive — a page renders exactly one complete response, then the request ends. So this module cannot literally push further chunks down an already-open connection the way a Node/Python SSE server typically does. Instead, `views/pages/sse/stream.liquid` sends a `retry: 1000` field, which tells the browser's native `EventSource` to reconnect roughly every second after each response closes, and every event carries an `id:` (the record's `created_at`) so each reconnect resumes exactly where the last one left off via the standard `Last-Event-ID` request header — a header the browser sends automatically, with no custom client code required. From the page's (and the user's) perspective this reads as one continuous live feed; under the hood it's a tight, entirely browser-managed reconnect loop rather than a single held-open socket. This is a deliberate, spec-legitimate use of SSE's built-in reconnection mechanism (not a workaround bolted on top of it), and it means delivery latency is bounded by the reconnect interval (~1s) rather than being instant.

## Installation

```bash
pos-cli modules install sse
```

## Setup

### 1. Add the init partial to your layout (or just the pages that need it)

```liquid
{% render 'modules/sse/init' %}
```

This sets up `window.pos.modules.active.sse` with `connect(channel, callbacks)`.

### 2. Subscribe to a channel

```html
<script type="module">
  window.pos.modules.active.sse.connect('activity', {
    onMessage: function(data) { console.log('got', data); },
    onOpen: function() { console.log('connected'); }
  });
</script>
```

`channel` is a free-form string — this module has no opinion on what it means, the same way `room_id` works in `pos-module-websocket`.

### 3. Publish an event

```liquid
function result = 'modules/sse/commands/events/publish',
  channel: 'activity',
  event: 'message',
  data: { "text": "Someone did a thing" }
```

or, from the browser, `POST /sse/events` with `channel`/`event`/`data` form fields (see `views/pages/sse/events.liquid`).

## Authorization

Public by default — `views/pages/sse/stream.liquid` and `views/pages/sse/events.liquid` have no auth checks, because this module has no way to know what a channel represents. Apps needing restrictions should override both via the platformOS **Module Override System**:

```
app/modules/sse/public/views/pages/sse/stream.liquid
app/modules/sse/public/views/pages/sse/events.liquid
```

## Events

| Event | Payload | Fired when |
|---|---|---|
| `sse_event_published` | `{channel, event, id, created_at}` | `commands/events/publish` appends a new event |

Consume this via `lib/consumers/sse_event_published/<consumer_name>.liquid` to react server-side (fan out elsewhere, trigger a notification) — readers of the stream itself pick up new events on their own via reconnection, they don't need this event.

## Dependencies

Declared in `modules/sse/pos-module.json`:

- `core` ^2.1.9 — events (`modules/core/commands/events/publish`) and validations (`modules/core/validations/presence`)
