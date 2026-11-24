# Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

## Unreleased

## v2.10.1

* Performance: the conversations list (the inbox sidebar, its live reloads and `GET /api/chat/conversations`) looks up the participants' profiles for the whole page in one query (the user module's `modules/user/profiles/search` GraphQL, with the same slugs as `profiles/find`), instead of one `profiles/find` per participant of each conversation (up to 100 for a page of 50). The attachment types for "Sent an image" previews are looked up the same way. A host that overrode the `queries/profiles/find` or `queries/profiles/search` Liquid query no longer changes the profiles in the list - an override of the `modules/user/profiles/search` GraphQL (like one adding an avatar) still does.

## v2.10.0

* Removed: the unused `modules/chat/queries/conversations/find` and `modules/chat/queries/conversations/search` queries (and `graphql/conversations/search_by_message`), and the unused `pos-chat-csrfToken.js`. Use `queries/conversations/find_by_participant` and `queries/conversations/search_by_participant` instead.
* Fix: the inbox no longer fails to start when the host app has its own `window.pos` without `window.pos.modules` (or `translations`) - each part is created when missing.
* Fix: `theme/simple/message_button` shows "Message" when given neither `label` nor `label_key` (it showed nothing).
* Fix: the uploader's 10 MB limit is set explicitly, the same as the upload property's `content_length` - it was read from an attribute nothing rendered and only matched because 10 MB is the uploader's default.
* Change: a message sent to a conversation the user isn't part of is logged as `not a participant, message dropped` (the log said it would be stored on the sender's side, which it never was), and both logs in `conversate/receive` use `type:`. The leftover commented-out e-mail notification there is removed.
* Docs: the push notification is debounced by about 10 seconds (`delay: 0.16` minutes), not 1 or 10 minutes as CLAUDE.md said; `schema/uploads.yml` explains that `metadata` holds JSON in a string property.

## v2.9.1

* Fix: a message with attachments only, sent without a `message` (or with `null`), is stored. The `create` mutation required the text, so such a message was lost with a GraphQL error - the inbox always sends a text (empty for attachments only), so only other clients were affected.
* Fix: the push notification's title is translatable (`modules/chat/push_title`, "New message from %{name}"). It's in the instance's default language, as it's sent from a background job.
* Fix: the debounced push notification check skips a message that no longer exists, instead of searching every conversation's messages for it.

## v2.9.0

* Feature: the `message_created` live notification and the `pos-chat:message` event detail carry `sender_avatar_url` (the sender's picture as the inbox shows it, `null` when the host's profiles have no avatar), `preview` (the text on one line, cut to 150 characters, or "Sent an image" / "Sent an attachment" for a message with files only - ready for a toast) and `attachment_count`.
* Change: the inbox sidebar and the push notification make their one-line summary of a message with the new `queries/messages/preview` (the same as the notification's `preview`). Line breaks in the sidebar's last-message preview and in the push notification's text are shown as spaces, and the push notification's text ends with "…" instead of "..." when cut.

## v2.8.3

* Fix: in the inbox sidebar, a long last-message preview no longer runs into the date next to it. The date is always shown in full on one line ("23 minutes ago" wrapped on narrow screens), the preview takes the rest of the row and is cut with an ellipsis, and the two keep a gap between them (it used a CSS variable that doesn't exist, so there was none).

## v2.8.2

* Performance: `modules/chat/notifications/init` no longer counts the unread conversations while the page is rendered, so it adds no database query to every page of the host app. The notifications client reads the number from `GET /api/chat/notifications.json` as soon as it starts, after the page has loaded, and fills the `[data-pos-chat-unread-conversations]` badges then.

## v2.8.1

* Fix: in the inbox sidebar, the highlight behind the open conversation no longer sticks out past the sidebar's border for a moment after the page loads. It took the card's new size with a transition when the card got narrower (the date in it is shortened after load), and now takes it at once - only its move between conversations on hover is animated.

## v2.8.0

* Feature: the inbox sidebar is kept up to date without reloading the page. A new message in any conversation (or one the user sends) moves it to the top with its new last message, a new conversation shows up, and a conversation read in another tab or on another device is no longer shown as unread. The inbox starts the live notifications itself for this, so it works without `modules/chat/notifications/init` in the layout too.
* Fix: a message in the conversation open in the inbox no longer makes the number of unread conversations go up and back down a moment later (the badge flashed). The number counted with it is held back while the inbox marks the conversation read, and is shown after 5 seconds only if that doesn't happen.
* Change: with the app open in several tabs, `pos-chat:message` is fired in only one of them (the one with the conversation open, otherwise the focused or visible one), so a toast or a sound isn't repeated in each tab. The tabs agree over a `BroadcastChannel`, which delays the event by about 0.2 s. `pos-chat:unread` and the badges are still updated in every tab. Code that has to run in every tab can use the new `window.pos.modules.chat.notifications.onMessage(callback)`.
* Change: `conversations.frame` takes an optional `conversation_id`, shown as the open conversation, and each item of the list carries the conversation's id as `data-conversation-id`.

## v2.7.0

* Feature: live notifications for any page of the host app, not only the inbox. `{% render 'modules/chat/notifications/init' %}` in the layout starts them for users who can use the chat: the page gets a `pos-chat:message` event on `document` for each new message (sender, text, conversation and its inbox url, and `active` when the inbox on that page has it open), a `pos-chat:unread` event when the number of unread conversations changes, and every element with the `data-pos-chat-unread-conversations` attribute shows that number (hidden at 0). The current number is also `window.pos.modules.chat.notifications.unread_conversations`. See the README, Live notifications. The example app shows it as a badge on the Inbox link.
* Feature: the notifications sent to the `notifications-<profile id>` room carry a `type` (`message_created`), the recipient's `unread_conversations` and `unread_at` (when it was counted, so a client can ignore an older count arriving late). Reading a conversation sends a `conversation_read` notification with the new number to the reader's own room, so the number goes down in their other tabs and devices too.
* Feature: `GET /api/chat/notifications.json` returns the current user's `unread_conversations` and `unread_at`. The notifications client reads it every time it connects, as the WebSocket doesn't replay what was sent while it wasn't connected.
* Change: an unread conversation in the inbox sidebar is shown with a ring around the avatar instead of a dot on the right.
* Fix: a conversation without a message yet (started by attaching a file that was never sent) is no longer counted as unread by `queries/conversations/number_of_unread_by_participant` - it isn't listed, so it couldn't be opened and read either.
* Change: `commands/messages/create` takes the optional `conversation` and `current_profile` and then marks the conversation unread for the others before publishing `chat_message_created`, so the event's consumers see it unread. The `conversate` channel passes them.
* Upgrade: if your app overwrites `views/partials/channels/conversate/receive.liquid`, pass `conversation: conversation, current_profile: current_profile` to `modules/chat/commands/messages/create` and remove the `mark_unread` call after it - otherwise the number of unread conversations sent with a new message can be one too low until the next change.

## v2.6.0

* Feature: a conversation opened with `to_uuid` that isn't started yet (it is created with its first message), or has no message yet, is shown on top of the sidebar's conversations list, highlighted as the open one, instead of not being in the list at all.

## v2.5.0

* Feature: the inbox sets the page title through `content_for 'meta_title'`, with the other person's name when a conversation is open ("Jane Doe - Inbox") and the new `modules/chat/inbox_title` translation otherwise. Layouts that read the slot, like the community module's, show it; others ignore it. The slot holds plain text, so a layout must escape it when printing it.

## v2.4.0

* Security: `GET /api/chat/conversations` no longer returns the participants' whole profiles (email, `user_id`, roles, 2FA and email verification status) - only their `id`, `uuid`, `name`, `first_name` and `last_name`. Before, anyone who could use the chat could read the email address of everyone they had a conversation with.
* Fix: a conversation with many images opens scrolled to the newest message again. Images now take their space before they load (from the dimensions stored with the upload), and an image loading while the user is at the bottom keeps the newest message in view, instead of a smooth scroll that stopped short as more images came in.
* Fix: files with the same name sent from one page view (like two photos named `image.jpg`) no longer replace each other - the second one replaced the first one's file, so both messages showed it. Every file now gets its own presigned upload from the new `GET /api/chat/uploads/presign` (`presign_url` of common-styling's uploader), which requires common-styling 1.41.0.
* Upgrade: requires common-styling 1.41.0 or later (the uploader's `presign_url`) - update it together with the chat.

## v2.3.0

* Security: `GET /inbox` no longer creates conversations or marks them read, so a link or redirect from another site (or a prefetch) can't do it on the user's behalf. A new conversation is created by `POST /api/chat/conversations` (CSRF-protected) when its first message or attachment is sent, and the open conversation is marked read over the WebSocket.
* Security: `per_page` of the message history and conversation list (`/api/chat/messages`, `/api/chat/conversations`, `/conversations.frame`) is capped at 50, so a single request can't load an unbounded number of records.
* Security: users without the `chat.inbox` permission no longer get new messages through the `notifications` channel or as push notifications - revoking it now stops the delivery of messages, including on a channel subscribed to before.
* Security: the people search matches names only, not email addresses, so it can no longer be used to find out whether an email address is registered or whose it is.
* Change: the people search only lists people who can use the chat (their roles grant `chat.inbox`), and a conversation can only be started with such a person - the inbox shows "This person can't receive messages" otherwise. Hosts can add their own rules on who may contact whom by overwriting `commands/conversations/find_or_create/check.liquid`.
* Security: the 10 MB attachment limit is now enforced on the upload itself (S3 refuses larger files), not only against the size the browser reports - before, files up to 100 MB could be stored.
* Security: the inbox page no longer puts the whole profile of the signed-in user (email, roles, 2FA status...) into `window.pos.profile` - only its `id`, the one field the chat uses. `window.pos.profile.timezone` is no longer set either, and the client no longer sends its own id and name with each message (the server never used them).
* Change: `/inbox?to_uuid=<profile uuid>` opens an empty chat until the first message is sent, so the conversation no longer exists right after the link is opened. Links to it keep working unchanged.

## v1.0.9

* Fix: fix dependencies version

