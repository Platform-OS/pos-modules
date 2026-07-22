# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **pos-module-chat** module. The monorepo-wide conventions (command pattern, hooks, events, RBAC, module override system, naming) are documented in `../CLAUDE.md` — read that for the shared platformOS patterns. This file covers only what is specific to the chat module.

## What this module does

Real-time bi-directional chat over WebSockets (Rails Action Cable, via the `actioncable` npm client). Depends on `core`, `user`, `common-styling`, `push_notifications` (see `pos-module.json`). Profile module is also expected at runtime (participants are profiles).

The distributed part is `modules/chat/` only. `app/` is a non-distributed example app (permissions overwrite, layout wiring, import map) and `tests/` is the E2E suite — neither ships when a consumer runs `pos-cli modules install chat`.

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
function conversations = 'modules/chat/queries/conversations/search_by_participant', participant_id: current_profile.id, limit: 20, page: 1
```

### WebSocket channel handlers

Action Cable channel actions are Liquid partials at `views/partials/channels/<channel>/<action>.liquid`. The channel is `conversate`:

- `channels/conversate/subscribed.liquid` — authorization gate: echoes `'true'`/`'false'` depending on whether `current_profile` is a participant of `room_id` (the conversation id). Returning `false` makes Action Cable reject the subscription.
- `channels/conversate/receive.liquid` — handles an incoming message: re-verifies participation, escapes the body with `raw_escape_string`, creates the message via the command, and marks the conversation unread for the recipient. **Sender-side persistence**: if the receiver is not a participant the message is skipped here and persisted on the sender's side instead (see the skip log).

Both handlers independently re-check participation — do not assume `subscribed` authorization carries into `receive`.

### Client JS and import map

`assets/js/pos-chat.js` is the main client (subscription, send, render, infinite-scroll pagination). It is **not** bundled — it's loaded via a native browser import map that the host app must declare in `<head>` before any other script (see README step 5 and `app/views/layouts`). Entry points: `pos-chat.js`, `pos-chat-consumer.js`, `pos-chat-csrfToken.js`, `pos-chat-notifications.js`. The client reads `window.pos.profile`, `window.pos.csrfToken`, and `window.pos.translations.chat`.

## Data model (`public/schema/`)

- `conversation`: `participant_ids` (array), `participant_read_ids` (array). Read-state is tracked by adding/removing a participant id from `participant_read_ids` (see the `mark_read` / `mark_unread` commands).
- `message`: `conversation_id`, `message`, **`autor_id`** (note: the field is spelled "autor", not "author" — match it exactly in queries, commands, and JS).

## Endpoints

| Method | Slug | Page file | Purpose |
|---|---|---|---|
| GET | `/inbox` | `views/pages/inbox.html.liquid` | Renders inbox; accepts `to_uuid` (start chat with a user) or `conversation_id` |
| GET | `/api/chat/messages.json` | `views/pages/api/messages/show.json.liquid` | Paginated message history (`conversation_id`, `page`, `per_page`) |

## Authorization

Access is gated by the `chat.inbox` permission via `modules/user/helpers/can_do_or_unauthorized`. Hosts grant it by overwriting `app/modules/user/public/lib/queries/role_permissions/permissions.liquid` (the example app grants it to `authenticated`). The branch name suggests room-level authorization work is in progress — channel handlers are the place participation is enforced.

## Events

`messages/create/execute` publishes a `chat_message_created` event (`message_id`, `app_host`), validated by `lib/events/chat_message_created.liquid`. It has three consumers:

- `lib/consumers/chat_message_created/broadcast_new_message.liquid` — broadcasts immediately to every other participant's `notifications-<profile_id>` WebSocket room (real-time in-app notification).
- `lib/consumers/chat_message_created/send_push_notification.liquid` — sends a Web Push notification immediately (via `pos-module-push-notifications`, a required dependency) to every other participant, one per message (no debounce/batching by design).

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
