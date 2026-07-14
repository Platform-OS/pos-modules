# pos-module-push-notifications

Web Push notifications for platformOS. Implements the [Web Push standard](https://www.rfc-editor.org/rfc/rfc8030) with VAPID authentication ([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)) and payload encryption ([RFC 8291](https://www.rfc-editor.org/rfc/rfc8291) / [RFC 8188](https://www.rfc-editor.org/rfc/rfc8188)).

`modules/push_notifications` is the module. `app/` is a minimal demo showing how to embed it in a real app, built with `user` (auth), `core` (events/validations), and `common-styling` (UI).

## Status

Encryption (ECDH → HKDF → AES-128-GCM) has been independently verified byte-for-byte against a reference Python (`cryptography`) implementation and confirmed by real end-to-end delivery in Chrome and Firefox.

### Known limitation

**No ephemeral sender key.** RFC 8291 wants a **fresh** EC keypair per message for forward secrecy. There is no `ec_generate` filter in Liquid, so every message reuses one static sender keypair (`PUSH_SENDER_PRIVATE_KEY_PEM` / `PUSH_SENDER_PUBLIC_KEY`). It works and decrypts correctly, but if that private key ever leaked, every message ever sent with it becomes readable in retrospect. Treat it as sensitively as the VAPID private key.

## Installation

```bash
pos-cli modules install push_notifications
```

## Setup

### 1. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

### 2. Generate a sender keypair (encrypts message bodies)

```bash
openssl ecparam -name prime256v1 -genkey -noout -out sender_private.pem
openssl ec -in sender_private.pem -pubout -conv_form uncompressed -outform DER | tail -c 65 | base64
```

Store the PEM contents as `PUSH_SENDER_PRIVATE_KEY_PEM` and the base64 output (converted to base64url) as `PUSH_SENDER_PUBLIC_KEY`.

### 3. Store configuration as platformOS constants

```liquid
function _ = 'modules/core/commands/variable/set', name: 'modules/push_notifications/VAPID_PUBLIC_KEY', value: '<base64url public key>'
function _ = 'modules/core/commands/variable/set', name: 'modules/push_notifications/VAPID_PRIVATE_KEY', value: '<base64url private key>'
function _ = 'modules/core/commands/variable/set', name: 'modules/push_notifications/VAPID_SUBJECT', value: 'mailto:admin@yoursite.com'
function _ = 'modules/core/commands/variable/set', name: 'modules/push_notifications/PUSH_SENDER_PRIVATE_KEY_PEM', value: '<sender private key PEM>'
function _ = 'modules/core/commands/variable/set', name: 'modules/push_notifications/PUSH_SENDER_PUBLIC_KEY', value: '<sender public key, base64url>'
```

Run these against every environment (including local dev) before testing — there is no migration in this repo that does it for you. `commands/notifications/send` fails fast with a `configuration` error if any of the five constants are missing.

### 4. Add the init partial to your layout `<head>`

```liquid
{% render 'modules/push_notifications/init' %}
```

This sets up `window.pos.modules.active.pushNotifications` with `register()`, `subscribe()`, `unsubscribe(id)`, and `getPermissionState()`.

### 5. Embed the subscribe button and subscriptions table

The module ships no page of its own for this — both pieces are partials meant to be dropped directly into your app's own settings page:

```liquid
{% liquid
  function subs = 'modules/push_notifications/queries/subscriptions/search',
    user_id: context.current_user.id,
    active: true,
    limit: 100,
    page: 1
%}
{% render 'modules/push_notifications/register' %}
{% render 'modules/push_notifications/subscriptions/index', subscriptions: subs.results %}
```

That's the entire integration surface — see `app/views/pages/settings.liquid` for the working example.

- **`register`** is a single Subscribe/Unsubscribe button that determines its own state client-side. `Notification.permission` alone can't tell you whether you're subscribed (it stays `"granted"` forever once granted, even after the server-side record is deleted), so instead it reads the browser's local `PushSubscription` and checks its endpoint against `GET /push_notifications/subscriptions` (the current user's active endpoints). This is also what makes delete-then-resubscribe work correctly, and it's paired with server-side dedup: subscribing again with a browser that already has an active subscription for the same endpoint returns the existing record instead of creating a duplicate row. State checks wait on `navigator.serviceWorker.ready`, not just `getRegistration()`, so the button doesn't read a stale/incomplete registration on first load.
- **`subscriptions/index`** renders a table of the user's active subscriptions (browser, created date, a "This device" tag, delete button). The push endpoint itself is never displayed — it's not meaningful to a user, and exposing it is unnecessary. "This device" is resolved the same way as the button: comparing the local `PushSubscription.endpoint` against the same JSON list.

Both partials style entirely with real `common-styling` classes (`pos-button`/`pos-button-primary`, `pos-table`, `pos-tag`, `pos-supplementary`) — no styling of your own is required, and none of the classes used are invented.

### 6. Get site-wide scope for the service worker

By default the worker is served at `/modules/push_notifications/sw-1.js`, and a service worker's scope defaults to the directory it's served from — good enough to receive and display pushes anywhere, but `notificationclick`'s `clients.matchAll()` will only find/focus tabs under `/modules/push_notifications/`.

To get real site-wide scope (so `notificationclick` can focus an already-open tab on any page), copy the file to your own app's **top-level** `assets/` directory — not a subfolder, keeping the `sw.js`/`sw-X.js` naming — then pass its root-served path as `service_worker_path`:

```bash
cp modules/push_notifications/public/assets/sw-1.js app/assets/sw-1.js
```

```liquid
{% liquid
  assign sw_path = '/sw-1.js'
%}
{% render 'modules/push_notifications/init', service_worker_path: sw_path %}
```

Note it's a hardcoded `/sw-1.js`, not `'sw-1.js' | asset_path`: platformOS serves top-level `assets/sw-X.js` at the domain root as a routing special case, but `asset_path` still resolves the same name to `/assets/sw-1.js` — a cross-scope URL that doesn't match where the file is actually reachable. `app/` in this repo does exactly this — see `app/assets/sw-1.js` and `app/views/layouts/application.liquid`.

### Subscription expiry & rotation

Two independent paths keep subscriptions from going stale:

- **Server-driven**: `commands/notifications/send` and `broadcast` delete the subscription and publish `push_subscription_expired` when the push service responds `404`/`410` to a delivery attempt.
- **Client-driven**: the service worker listens for [`pushsubscriptionchange`](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/pushsubscriptionchange_event), which the browser fires when it invalidates a subscription on its own (key rotation forced by the push service, expiry, etc.) — even with no tab open. It resubscribes with the original VAPID key and calls `POST /push_notifications/subscriptions/rotate` to swap the stored endpoint/keys in place, and publishes `push_subscription_rotated`.

The rotate endpoint authenticates by requiring the *previous* subscription's full credentials (`old_endpoint` + `old_p256dh` + `old_auth`) to match a stored record — not the session/CSRF token — since this call can happen in the background with no page open to source a fresh `authenticity_token` from.

The VAPID public key and rotate URL travel as query params on the service worker's own registration URL (`?vapid=...&rotate_url=...`), since `pushsubscriptionchange` has no other way to reach them. Override the rotate endpoint with the `rotate_url` init param if you mount it somewhere else.

## Usage

### Save a subscription

```liquid
function result = 'modules/push_notifications/commands/subscriptions/create',
  user_id: context.current_user.id,
  endpoint: params.subscription.endpoint,
  p256dh: params.subscription.keys.p256dh,
  auth: params.subscription.keys.auth
```

Idempotent per `(user_id, endpoint)`: subscribing again with the same browser and the same user returns the existing record rather than inserting a duplicate row. On a shared device where a second user subscribes with the same browser, they get their own separate record with the same endpoint — both users legitimately receive pushes sent to their own subscription, since it's the same physical push channel. Ownership is never transferred or deleted out from under the other user.

### Send to one subscription

```liquid
function result = 'modules/push_notifications/commands/notifications/send',
  subscription_id: sub.id,
  payload: { "title": "Hello", "body": "World", "url": "/dashboard" }
```

Pass an already-loaded `subscription: sub` alongside `subscription_id` to skip the redundant lookup — `broadcast` does this internally since it already has the record from its own search.

### Broadcast to all subscriptions for a user

```liquid
function result = 'modules/push_notifications/commands/notifications/broadcast',
  user_id: user.id,
  payload: { "title": "New message", "body": "You have a new message" }
```

Returns `{sent, failed, expired}` counts across that user's active subscriptions. To fan out to several recipients, call it once per user ID and sum the results — see `app/views/pages/push_notifications/demo.liquid` for a working example that sends to a caller-chosen list of users via a multiselect.

## Events

| Event | Payload |
|---|---|
| `push_subscription_created` | `{subscription_id, user_id, endpoint, browser}` |
| `push_subscription_deleted` | `{subscription_id, user_id}` |
| `push_subscription_expired` | `{subscription_id, user_id}` |
| `push_subscription_rotated` | `{subscription_id, user_id, endpoint, browser}` |
| `push_notification_sent` | `{subscription_id, user_id}` |
| `push_notification_failed` | `{subscription_id, user_id, status_code}` |

## Dependencies

Declared in `modules/push_notifications/pos-module.json`:

- `core` ^2.1.9 — events (`modules/core/commands/events/publish`) and validations (`modules/core/validations/presence`)
- `user` ^5.2.11 — subscriptions are keyed by `user_id`
- `common-styling` ^1.38.0 — the `register` and `subscriptions/index` partials style themselves with its `pos-button`/`pos-table`/`pos-tag` classes; it must be initialized (`{% render 'modules/common-styling/init' %}`) somewhere in the consuming app's layout for those partials to render correctly.
