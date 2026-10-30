# Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

## Unreleased

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

