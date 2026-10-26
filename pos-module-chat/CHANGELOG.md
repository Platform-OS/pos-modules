# Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

## Unreleased

* Security: `GET /inbox` no longer creates conversations or marks them read, so a link or redirect from another site (or a prefetch) can't do it on the user's behalf. A new conversation is created by `POST /api/chat/conversations` (CSRF-protected) when its first message or attachment is sent, and the open conversation is marked read over the WebSocket.
* Security: `per_page` of the message history and conversation list (`/api/chat/messages`, `/api/chat/conversations`, `/conversations.frame`) is capped at 50, so a single request can't load an unbounded number of records.
* Change: `/inbox?to_uuid=<profile uuid>` opens an empty chat until the first message is sent, so the conversation no longer exists right after the link is opened. Links to it keep working unchanged.

## v1.0.9

* Fix: fix dependencies version

