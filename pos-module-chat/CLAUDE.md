# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **pos-module-chat** module. The monorepo-wide conventions (command pattern, hooks, events, RBAC, module override system, naming) are documented in `../CLAUDE.md` — read that for the shared platformOS patterns. This file covers only what is specific to the chat module.

## What this module does

Real-time bi-directional chat over WebSockets (Rails Action Cable). The `@rails/actioncable` client is vendored at `assets/js/vendor/actioncable-<version>.esm.js` (its header says how to update it), not loaded from a CDN. Depends on `core`, `user`, `common-styling`, `push_notifications` (see `pos-module.json`). Profile module is also expected at runtime (participants are profiles).

The distributed part is `modules/chat/` only. `app/` is a non-distributed example app (permissions overwrite, layout wiring) and `tests/` is the E2E suite — neither ships when a consumer runs `pos-cli modules install chat`.

## Distinctive architecture (read before editing)

### Business logic lives under `public/lib/`

Commands, queries, events, and consumers all follow the conventional layout described in the root CLAUDE.md:

- Commands: `modules/chat/public/lib/commands/<resource>/<action>.liquid` (+ `build.liquid`/`check.liquid` subdirs)
- Queries: `modules/chat/public/lib/queries/<resource>/<...>.liquid`
- Events: `modules/chat/public/lib/events/`
- Consumers: `modules/chat/public/lib/consumers/`

They are invoked with the path relative to `public/lib/` (the `lib/` prefix is dropped):

```liquid
function conversation = 'modules/chat/commands/conversations/find_or_create', object: object, current_profile: current_profile
function conversations = 'modules/chat/queries/conversations/search_by_participant', participant_id: current_profile.id, limit: 20, read: null, before: null
```

### WebSocket channel handlers

Action Cable channel actions are Liquid partials at `views/partials/channels/<channel>/<action>.liquid`. The channel is `conversate`:

- `channels/conversate/subscribed.liquid` — authorization gate: echoes `'true'`/`'false'` depending on whether `current_profile` is a participant of `room_id` (the conversation id). Returning `false` makes Action Cable reject the subscription.
- `channels/conversate/receive.liquid` — handles an incoming message: re-verifies participation, creates the message via the command (the body is stored as typed — escaping happens at render time, as plain text with newlines turned into `<br>`: each line printed via auto-escaping `{{ }}` in `message.liquid`, `encodeHtml` in `pos-chat.js` — keep the two identical; never store it pre-escaped, don't use `markdown`, and never `html_safe` user text — on platformOS it *unescapes*), and marks the conversation unread for the recipient (which also sets its `last_message_at`). **Sender-side persistence**: if the receiver is not a participant the message is skipped here and persisted on the sender's side instead (see the skip log). It also doubles as the mark-read ping: when the payload carries `mark_read: true` (sent by `pos-chat.js` when the channel connects and whenever it renders a live message, only while the tab is visible — the inbox page itself never marks read, see below), it marks the current participant read instead of creating a message, and echoes `"false"` to suppress the default rebroadcast-to-room. This is what the debounced push notification (see Events below) checks against.

  `receive` is the *only* action `WebNotificationsChannel` (the Ruby ActionCable channel backing this) dispatches to — `subscribed` is a lifecycle callback, not a `perform`-able action. A custom action name (e.g. a client calling `.perform('mark_read')`) is silently dropped server-side since no such method exists on the channel; that's why mark-read piggybacks on `receive` via a payload flag instead of being its own partial.

Both handlers independently check the `chat.inbox` permission and then participation — do not assume `subscribed` authorization carries into `receive`.

### Client JS

`assets/js/pos-chat.js` is the main client (subscription, send, render, infinite-scroll pagination). It is **not** bundled and needs no import map. It's loaded the way common-styling's `init` loads its modules: an inline script in `partials/inbox.liquid` does `import()` of `pos-chat-consumer.js` and `pos-chat.js` by `asset_url` on `DOMContentLoaded`, then starts the chat with `new window.pos.modules.chat({ inbox, consumer })`. `pos-chat.js` has no imports of its own and registers itself on `window.pos.modules`. Assets are cached for years keyed on the full URL, so any file whose content changes between releases has to be loaded by its `asset_url`. Files that never change at a given path, like the vendored Action Cable client, have the version in their file name and are imported relatively. The client reads `window.pos.profile` (only its `id`, to tell the user's own messages from the others - `inbox.liquid` exposes nothing else of the profile), `window.pos.csrfToken`, and `window.pos.translations.chat`.

## Data model (`public/schema/`)

- `conversation`: `participant_ids` (array), `participant_read_ids` (array), `last_message_at` (datetime). Read-state is tracked by adding/removing a participant id from `participant_read_ids` (see the `mark_read` / `mark_unread` commands). `last_message_at` is set by `mark_unread` with every new message (and by a migration for older conversations); a conversation without it has no message yet and isn't listed.

The conversations list (`queries/conversations/search_by_participant`, used by the inbox, `conversations.frame` and `GET /api/chat/conversations`) shows unread ones first, then read ones, each newest first. Both groups are queried and sorted in the database (`not_array_contains` / `array_contains` on `participant_read_ids`, sorted by `last_message_at`), and paged by cursor (`read` + `before` = the group and `last_message_at` of the last one shown, returned as `next_read` / `next_before`), since opening a conversation moves it between the groups and would shift numbered pages.
- `uploads`: `conversation_id`, `uploader_id`, `upload` (private file), `metadata` (type, name, size and image dimensions as reported by the client). The file size limit (10 MB) is the upload property's `content_length` option, which platformOS puts into the presigned policy, so S3 refuses larger files; `uploads/create/check` only checks the reported size, for a readable error.
- `conversation_lock`: a single row with a `token` that changes on every update - only its row lock matters (see Who can find and message whom).
- `message`: `conversation_id`, `message`, **`autor_id`** (note: the field is spelled "autor", not "author" — match it exactly in queries, commands, and JS).

## Endpoints

| Method | Slug | Page file | Purpose |
|---|---|---|---|
| GET | `/inbox` | `views/pages/inbox.liquid` | Renders inbox; accepts `conversation_id`, or `to_uuid` (opens the chat with that profile, empty if it doesn't exist yet) |
| POST | `/api/chat/conversations` | `views/pages/api/conversations/create.json.liquid` | Starts the conversation with `to_uuid` (or returns the existing one); called by `pos-chat.js` on the first message or attachment |
| GET | `/api/chat/messages.json` | `views/pages/api/messages/show.json.liquid` | Paginated message history (`conversation_id`, `before` = the oldest message id shown, `per_page`; `page` still works but shifts as new messages arrive). Sorted by id, like the messages the inbox renders, which carry it as `data-id` |

**GET never writes.** `/inbox` neither creates a conversation nor marks one read: the session cookie is SameSite=Lax, so a cross-site link or redirect (or a prefetch) would otherwise do it on the user's behalf. Creation is a CSRF-checked POST, marking read goes over the WebSocket.

## Authorization

Access is gated by the `chat.inbox` permission via `modules/user/helpers/can_do_or_unauthorized`. The WebSocket handlers check it too (`conversate` on subscribe and on every `receive`, `notifications` on subscribe), and the consumers that deliver a message to the other participants (`broadcast_new_message`, `send_push_notification`) skip anyone without it via `queries/participants/can_use_chat` - a subscription is only authorized when it's opened, so this is what stops delivery after a revocation. Consumers have no signed-in user, so that query adds the `authenticated` role itself, the way `modules/user/helpers/current_profile` does - a bare `can_do` on a profile loaded by id would deny everyone. Hosts grant it by overwriting `app/modules/user/public/lib/queries/role_permissions/permissions.liquid` (the example app grants it to `authenticated`). The branch name suggests room-level authorization work is in progress — channel handlers are the place participation is enforced.

## Who can find and message whom

- **Search** (`search.frame` and the example app's people list) goes through `queries/participants/search`: it matches the profile's `name` only, never the email (so it can't tell whether an address is registered), and only returns people who can use the chat. Those are found in the database by role: `queries/participants/chat_roles` lists the roles whose permissions include `chat.inbox` (plus `superadmin`), or returns null when `authenticated` grants it and nobody has to be filtered out.
- **Starting a conversation** (the first message, `POST /api/chat/conversations` -> `commands/conversations/find_or_create`) runs `find_or_create/check` before creating it: by default every other participant must be able to use the chat. That file is the place for a host's own rules on who may contact whom (overwrite it); the inbox runs it too, to show "This person can't receive messages" instead of the input. An existing conversation is opened regardless. There's no unique index, so `find_or_create` creates it under a lock: inside a `{% transaction %}` it first updates the single `conversation_lock` row (`commands/conversations/lock`), which holds a database row lock until commit, then looks for the conversation again and only then creates it - a second request at the same time (two tabs, a double click) waits and finds the first one's conversation. Only creating a conversation takes the lock. The row is made by a migration, and recreated outside the transaction when missing (a data import removes it).
- There is no blocking, opt-out or rate limit (decided 2026-10-26) - left to host apps.

## Events

`messages/create/execute` publishes a `chat_message_created` event (`message_id`, `app_host`), validated by `lib/events/chat_message_created.liquid`. It has two consumers:

- `lib/consumers/chat_message_created/broadcast_new_message.liquid` — broadcasts immediately to every other participant's `notifications-<profile_id>` WebSocket room (real-time in-app notification).
- `lib/consumers/chat_message_created/notify_of_new_message.liquid` — debounces push notifications: waits 1 minute, then checks whether the message is still the last one in its conversation. If it was superseded by a newer message, it's a no-op (the newer message's own delayed check will fire instead). Otherwise it publishes `message_notification_to_send` (`message_id`, `app_host`), validated by `lib/events/message_notification_to_send.liquid`.

`message_notification_to_send` has one consumer:

- `lib/consumers/message_notification_to_send/send_push_notification.liquid` — sends a Web Push notification (via `pos-module-push-notifications`, a required dependency) to every other participant who hasn't already read the message (checked against `conversation.participant_read_ids`). Because it only fires 10 minutes after the last message in a burst, a rapid back-and-forth produces a single push, not one per message.

## Testing

Playwright E2E only (no unit tests). `npm run pw-tests` runs the `test` project, which depends on a `setup` project (`auth.setup.ts`) and ignores `prepare-env.spec.ts` / `example.spec.ts`. Config notes:

- `testIdAttribute` is `data-tc` (not the Playwright default `data-testid`).
- `baseURL` comes from `MPKIT_URL`. Tests run against a live staging instance, not localhost.
- Page objects live in `tests/pages/`; test data in `tests/data/`.
- Seed data: `tests/data/seed/seed.sh` deploys fixtures + migrations in `tests/post_import/`. CI (`.github/workflows/e2e_tests_on_ps.yml`) reserves a CI instance, runs the seed, then the tests.

Run a single spec:

```bash
npx playwright test tests/messaging.spec.ts --project=test --reporter=list
```

## Linter scoping

`.platformos-check.yml` ignores dependency modules (`core`, `user`, `common-styling`) and silences `UnusedPartial` for channels, events, consumers, and lib queries (they're invoked dynamically by path, so the linter can't see the references).
