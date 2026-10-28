---
id: decision-9
title: Spike results (TASK-1, support-dev, 2026-10-28)
date: '2026-10-28'
status: accepted
---
## Context and decision

Throwaway probe pages were deployed to support-dev, measured, then deleted. Their queued test jobs were deleted too.

| # | Question | Result | Consequence |
|---|---|---|---|
| 1 | Inbound multipart with a file part | Text fields can be read one by one (`context.params.from`). The file part is `ActionDispatch::Http::UploadedFile`, which Liquid cannot read. Touching `context.params` as a whole (`hash_keys`, `json`, passing it on) then crashes the page with `undefined method 'to_liquid'`. | **Inbound Parse uses raw mode (`send_raw: true`)**: the full MIME message arrives as the text field `email` (a 278-byte test email with a base64 attachment was read in full). The inbound page reads only named keys. Attachments are taken from the MIME parts (attachment path B). |
| 1b | Real Inbound Parse post, raw mode (`support-dev.platformos.com`, MX `10 mx.sendgrid.net`) | Three emails arrived: one sent through SendGrid, two from Gmail (112 KB with a PDF, 3 MB with photos). Keys: `to, from, subject, envelope, charsets, dkim, SPF, sender_ip, email` plus the slug params. No file parts, so `context.params` can be read as a whole. SPF and DKIM results arrive as fields. Gmail sends pasted photos as `Content-Disposition: inline; filename=…` parts inside `multipart/related`. | Path B confirmed. A part with a filename is an attachment whether its disposition is `attachment` or `inline`. |
| 1c | Largest inbound email | A 10 MB raw email arrived. 16.6 MB and 25 MB raw emails sent by SendGrid never arrived. A direct POST answered 404 (page ran) up to 15 MB and **503 at 17 MB and 20 MB**: platformOS rejects the request before any page runs. | About 11 MB of attachments per inbound email is the ceiling (base64 adds ~37 %). Larger emails are retried by SendGrid and then dropped, without a bounce; the module cannot see them. Help text says "attachments up to 10 MB". Raising the limit is a question for platformOS. |
| 2 | Custom `Message-ID` through Mail Send | Sent with our `Message-ID`, `In-Reply-To`, `References` and `Reply-To: reply+…@`. All four arrived unchanged in the raw email. | Threading uses our own Message-ID; no `X-Message-Id` fallback needed. |
| 3 | Outbound attachments | A base64 attachment in Mail Send's `attachments` array arrived intact. | **Option A**: the composer posts base64; capped at 10 MB total to stay under the ~16 MB request limit. |
| 10 | SendGrid API with the restricted key | Key scopes: `mail.send`, `user.webhooks.parse.settings.*`, `user.webhooks.event.settings.*`, `whitelabel.read`. `POST /v3/user/webhooks/parse/settings` (with `send_raw: true`) and `PATCH /v3/user/webhooks/parse/settings/{hostname}` both answered 200. `GET /v3/user/webhooks/event/settings/all` shows the account already has one Event Webhook used by another system (`max_allowed: 5`). | Rotation PATCHes the parse setting by hostname. The module creates **its own** Event Webhook (`POST /v3/user/webhooks/event/settings`), stores the returned id, updates only that id, and never edits a webhook it did not create (D-28 updated). |
| 4 | Service worker from a module page | `sw.js.liquid`, and `slug: …/sw.js` with `response_headers`, are both served as `application/javascript`. A custom `Service-Worker-Allowed` header passes through. | Serve `/support-desk/sw.js` from the module; drop the root `sw-support.js` fallback and generator step 6. |
| 5 | Manifest | `slug: …/manifest.json` with `format: json` serves `application/json`. | As specified. |
| 6 | Slug params | `slug: …/tickets/:id` gives `context.params.id = "18030"`. | As specified. |
| 7 | `background` delay | Fractions work (0.05 min ran after about 4 s). Delays of 43200 min (30 d) and 129600 min (90 d) were accepted and scheduled. | SLA timers need no cap. The sweep still re-checks missed deadlines. |
| 8 | CSRF | A POST with the session's `authenticity_token` gives `csrf_request_valid: true`. A cookie-less POST without a token gives `false`, and the page still runs. | Every desk POST must check it itself (as specified). Webhooks have no session, so they rely on the secret. |
| 9 | `compute_hmac` | Same input and secret give the same sha256 hex across requests. | The reply token works as specified. |

Our support-dev inbound host `support-dev.platformos.com` stays registered in SendGrid (raw mode) for development; TASK-7 points it at the real inbound page. The account's other Inbound Parse host (`support.platformos.com`) was not touched.

## Consequences

Spec 04 §0.2, §1, §2.1–2.3, §4 and §6, 01 D-28, 06 §4, 07 §4 and 09 §3 are updated. TASK-7 builds a MIME parser in Liquid: header unfolding, boundaries, nested multipart, and quoted-printable and base64 decoding.
