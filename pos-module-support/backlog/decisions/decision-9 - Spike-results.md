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
| 4 | Service worker from a module page | `sw.js.liquid`, and `slug: …/sw.js` with `response_headers`, are both served as `application/javascript`. A custom `Service-Worker-Allowed` header passes through. | Serve `/support-desk/sw.js` from the module; drop the root `sw-support.js` fallback and generator step 6. |
| 5 | Manifest | `slug: …/manifest.json` with `format: json` serves `application/json`. | As specified. |
| 6 | Slug params | `slug: …/tickets/:id` gives `context.params.id = "18030"`. | As specified. |
| 7 | `background` delay | Fractions work (0.05 min ran after about 4 s). Delays of 43200 min (30 d) and 129600 min (90 d) were accepted and scheduled. | SLA timers need no cap. The sweep still re-checks missed deadlines. |
| 8 | CSRF | A POST with the session's `authenticity_token` gives `csrf_request_valid: true`. A cookie-less POST without a token gives `false`, and the page still runs. | Every desk POST must check it itself (as specified). Webhooks have no session, so they rely on the secret. |
| 9 | `compute_hmac` | Same input and secret give the same sha256 hex across requests. | The reply token works as specified. |

Still open (needs the SendGrid restricted key and test inbound hostname from Artur):
- #2 Custom `Message-ID` kept by Mail Send.
- #3 Outbound attachment method.
- #10 Parse and Event Webhook settings update endpoints.
- A real Inbound Parse post in raw mode.
- The largest raw post accepted.

## Consequences

Spec 04 §2.1–2.3 and §1 step 3, 06 §4, 07 §4 and 09 §3 are updated. TASK-7 builds a MIME parser in Liquid: header unfolding, boundaries, nested multipart, and quoted-printable and base64 decoding.
