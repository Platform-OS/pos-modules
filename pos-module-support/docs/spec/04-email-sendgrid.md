# 04 — Email: provider-neutral layer and the SendGrid adapter

Requirements: EM-0a..EM-0c, EM-1..EM-18 in the detailed PRD. Decisions D-3, D-4.

## 0. Provider adapters and per-installation configuration

Nothing about a customer's email setup is in the module code. Each installation chooses its provider and addresses when it deploys the module (install generator, then Settings → Email):

| Value | Stored in | Set by |
|---|---|---|
| provider (`sendgrid` in the MVP) | setting `email_provider` | generator / Settings → Email |
| API key | constant `modules/support/EMAIL_API_KEY` | generator / `constants-set` |
| inbound domain or address | setting `inbound_domain` (e.g. `in.support.platformos.com`, or a provider-hosted address) | generator / Settings → Email |
| inbound and events secrets | constants `modules/support/INBOUND_SECRET`, `EVENTS_SECRET` | generated; rotated from Settings → Email (§0.2) |
| reply-token secret | constant `modules/support/REPLY_TOKEN_SECRET` | generated |
| from name/address per department | `department` records | Settings → Departments |
| API base URL (tests only) | setting `email_api_base_url` | test setup |

Adapter contract, one folder per provider under `lib/commands/email/providers/<provider>/`:

| Partial | Input | Output |
|---|---|---|
| `parse_inbound` | `context.params` of the inbound webhook | normalized email `{message_id, in_reply_to, reference_ids[], from{email,name}, reply_to, to[], cc[], envelope_to[], subject, text, html, headers{}, auth{spf,dkim,spam_score}, attachments[{filename, content_type, content_base64, content_id}]}` |
| `send` | provider-neutral message `{from, reply_to, to[], cc[], subject, text, html, headers{}, attachments[], tag}` | `{ok, status, provider_message_id, error}` |
| `parse_events` | events webhook params | `[{message_ref, event: delivered|bounced|dropped|spam, reason}]` |
| `setup_instructions` | settings | DNS records, webhook URLs and steps to show in Settings → Email |
| `check` | settings | `{ok, problems[]}` — API key valid, sender domain authenticated (where the provider API exposes it) |

`commands/email/send` and `commands/inbound/process` call `'modules/support/commands/email/providers/' | append: provider | append: '/send'` (assign the path first, then `function`). Adding Postmark, Mailgun or Amazon SES later means adding one adapter folder; nothing else changes. Settings → Email shows "Send test email" and "Check inbound" (sends to a generated address and waits for the webhook) and the module refuses to send ticket mail until both pass (EM-0c).

### 0.1 Connecting a provider (Settings → Email, EM-0d..EM-0f)

A six-step guided setup; each step stores its result in `setting.email_status` (JSON per step) and unlocks the next. For SendGrid the module calls the provider's management API with the installation's own key and region (`https://api.sendgrid.com` or `https://api.eu.sendgrid.com`):

| Step | What the admin does | What the module does (SendGrid) |
|---|---|---|
| 1. Service and API key | Picks provider and region, pastes a key | Read-only call to confirm the key works and has Mail Send, Inbound Parse and Domain Authentication access (exact endpoint verified in TASK-1); stores it with `constant_set` as `modules/support/EMAIL_API_KEY`; shows only the last 4 characters |
| 2. Sending domain | Picks an authenticated domain (or authenticates one in SendGrid first) | Lists authenticated domains and their CNAME records; "Check DNS again" calls `POST /v3/whitelabel/domains/{id}/validate` and shows per-record results |
| 3. Receiving email | Enters an inbound hostname on that domain, adds the MX record | Shows `MX 10 mx.sendgrid.net`; "Create Inbound Parse" calls `POST /v3/user/webhooks/parse/settings` with `{hostname, url: <instance>/api/support/inbound/sendgrid/<secret>, spam_check: false, send_raw: true}` (SendGrid requires the hostname to be on an authenticated domain with the MX in place); falls back to showing the URL to paste |
| 4. Forward public addresses | Sets forwarding in Google Workspace / Microsoft 365 | Lists departments, public address, inbound address `<local_part>@<inbound_domain>`, last email received |
| 5. Test | Clicks "Send test email" and "Check inbound" | Sends a test to the admin through `send`; sends `check-<token>@<inbound_domain>` through the provider and waits up to 60 s for the webhook; shows timings and whether the Message-ID survived |
| 6. Turn on ticket email | Switches it on | Enabled only when step 5 passed; sets `email_status.enabled` |

### 0.2 Rotating the webhook secret (D-28)

Settings → Email shows the inbound and events URLs masked (`…/sendgrid/••••a91f`) with **Reveal** (admin only, logged as `team_secret_revealed`) and **Copy**. **Rotate secret**:
1. Generate a new 32-byte hex secret; store the current one in `setting.previous_inbound_secret` with `previous_secret_expires_at = now + 24 h`; `constant_set` the new `INBOUND_SECRET` (and `EVENTS_SECRET`).
2. Call the adapter's `update_inbound_url` (SendGrid: `PATCH /v3/user/webhooks/parse/settings/{hostname}` with the new URL for every inbound hostname; events: `PATCH /v3/user/webhooks/event/settings/{id}` on the module's own webhook — verified in TASK-1, decision-9).
3. If the provider call fails, keep both secrets valid and show "Update the URL at your provider" with the new URL to copy — mail keeps flowing on the old secret until the 24 h end.
4. The inbound page accepts the current secret, or the previous one while `previous_secret_expires_at` is in the future (both compared in constant time); after expiry the sweep clears it.

The daily connection check (EM-0f) repeats step 1 and the domain validation, and alerts support admins if sending fails, the key is revoked, or a department that normally receives mail has had none for 48 hours.

The rest of this file describes the **SendGrid adapter**, the MVP's only one, and uses our installation's values as the example.

## 1. SendGrid setup for an installation (shown by `setup_instructions`; our installation as the example)

1. **Sending domain**: in the pOS SendGrid account, Settings → Sender Authentication → authenticate `platformos.com` (or the department's domain) — publish the CNAMEs it gives (DKIM `s1._domainkey`, `s2._domainkey`, link branding optional). Check DMARC exists for the domain.
2. **Inbound subdomain**: the installer picks one on a domain they control (ours: `in.support.platformos.com`) and enters it in Settings → Email. DNS: `MX 10 mx.sendgrid.net` on that host only. Never change it once created.
3. **Inbound Parse**: Settings → Inbound Parse → Add Host & URL → host above → URL `https://<instance>/api/support/inbound/sendgrid/<INBOUND_SECRET>` (Settings → Email shows it). Turn **"POST the raw, full MIME message" on** (decision-9).
4. **Forwarding**: each public address (`support-dob@platformos.com` in Google Workspace) forwards to `dob@in.support.platformos.com`. Forwarding must keep the original message unchanged (Gmail "forward a copy").
5. **API key**: a restricted key with *Mail Send* only → constant `modules/support/EMAIL_API_KEY`.
6. **Event Webhook** (Should): an account can have up to 5 Event Webhooks and may already use one for another system. The module **adds its own** (`POST /v3/user/webhooks/event/settings`, stores the returned `id` in settings) and never edits one it did not create. Manually: Mail Settings → Event Webhook → **Create new webhook** → `https://<instance>/api/support/email-events/sendgrid/<EVENTS_SECRET>`, events delivered, bounce, dropped, spamreport.
7. **Staging**: Partner Portal → instance → enable API call notifications for staging.

## 2. Inbound

### 2.1 Endpoint
`views/pages/api/support/inbound.liquid`:

```liquid
---
slug: api/support/inbound/:provider/:secret
method: post
layout: ''
---
{% liquid
  # 1. authenticate by secret (Inbound Parse has no signature)
  assign expected = context.constants['modules/support/INBOUND_SECRET']
  assign authorized = false
  if expected != blank
    if context.params.secret == expected
      assign authorized = true
    endif
  endif

  if authorized
    # 2. store, then process in the background; nothing else in the request
    # never pass or iterate context.params whole: a multipart file part in it crashes Liquid (decision-9)
    function stored = 'modules/support/commands/inbound/store', email: context.params.email, envelope: context.params.envelope, spf: context.params.SPF, dkim: context.params.dkim, spam_score: context.params.spam_score, charsets: context.params.charsets
    if stored.valid
      background job_id = 'modules/support/commands/inbound/process', inbound_email_id: stored.id, max_attempts: 3, source_name: 'support_inbound'
    endif
  else
    response_status 404
  endif
%}
```
- Respond 2xx quickly; SendGrid retries on failure. Duplicate deliveries are dropped in `process` by `message_id_header`.
- **Raw mode is required (decision-9, verified on support-dev 2026-10-28).** In SendGrid's default mode attachments arrive as multipart file parts; platformOS cannot hand those to Liquid (`undefined method 'to_liquid' for ActionDispatch::Http::UploadedFile`), and touching `context.params` as a whole (`hash_keys`, `json`, passing it on) then crashes the page. Text fields can still be read one by one. So Inbound Parse is created with **"POST the raw, full MIME message" on**: the whole email arrives as the text field `email` (plus `envelope`, `SPF`, `dkim`, `spam_score`, `charsets`), and the page reads only named keys.

### 2.2 Parsing (SendGrid `parse_inbound` → normalized email)

Input (raw mode, decision-9): `email` (the full RFC 5322 message), `envelope` (JSON `{to:[…], from:"…"}`), `SPF`, `dkim`, `spam_score`, `charsets`. Headers, addresses, subject and body parts are all taken from `email`: split the header block at the first blank line, then walk MIME parts by boundary (nested `multipart/*` included), decoding `quoted-printable` and `base64` text parts.

Steps:
1. Unfold headers: `replace_regex: '\r?\n[ \t]+', ' '`.
2. Extract with `regex_matches` (case-insensitive, multiline): `Message-ID`, `In-Reply-To`, `References` (split on whitespace, keep `<…>` tokens), `Reply-To`, `Auto-Submitted`, `Precedence`, `X-Autoreply`, `X-Auto-Response-Suppress`, `List-Id`, `Return-Path`.
3. Addresses: parse `"Name" <addr>` lists from `from`, `to`, `cc`; lower-case addresses.
4. Charset: if `charsets` says a part is not UTF-8, convert with the `encode` filter.
5. Body: prefer `text` for `body_text`; sanitise `html` (strip `script`, `style`, `iframe`, event attributes, `javascript:` URLs) for `body_html`; compute `body_stripped` (§2.5).
6. Auth: store `{spf, dkim, spam_score}` in `message.auth_results`.

### 2.3 Attachments
For each entry in `attachment-info`:
1. `graphql presign = 'modules/support/uploads/presign', table: 'modules/support/attachment', property_name: 'file'` (`property_upload_presigned_url`).
2. `api_call_send` POST to `upload_url` with `form_data`: every `upload_url_payload` field as a value part, then `{ name: "file", file: { content_base64, filename, content_type } }` last.
3. Create the `attachment` record with the uploaded key, `content_id` from `content-ids`, `inline` when referenced by `cid:` in the HTML.
4. Rewrite `cid:` references in `body_html` to the module's attachment URL (`/support-desk/attachments/:id`, permission-checked, redirects to a short-lived signed URL).

Decided in TASK-1 (decision-9): **B, raw MIME.** Each attachment part's body is already base64 (strip line breaks), its filename and type come from the part's `Content-Disposition` / `Content-Type`, and `Content-ID` gives the inline mapping. Store the raw message in `inbound_email.raw_mime`. A part is an attachment when it has a `filename` (in `Content-Disposition` or the `name` of `Content-Type`), whether its disposition is `attachment` or `inline`: Gmail sends pasted images as `inline` parts inside `multipart/related`. **Size limit (measured):** platformOS answers 503 to a POST above about 16 MB, before any page runs. A 10 MB raw email arrived; 16.6 MB and 25 MB did not. Base64 adds about 37 %, so an inbound email with more than about 11 MB of attachments never reaches the module, and SendGrid only retries and then drops it (the customer gets no bounce). The module cannot detect these emails; the customer-facing help text says "attachments up to 10 MB", and a raised limit is a question for platformOS.

### 2.4 Loop, auto-reply and spam rules (in this order; first hit marks `inbound_email.state = ignored`)
0. **Blocklist (D-27), checked before anything is stored**: the envelope sender and the `From` address, lower-cased, against `blocked_sender` (`kind: address` exact match, `kind: domain` match on the part after `@`, including subdomains). On a hit, answer 200 to the provider (so it does not retry), store **nothing** of the email, and only bump `blocked_sender.hits` / `last_hit_at`.
1. Contact `blocked` (set by Mark as spam together with the blocklist row) → `blocked` (kept for contacts blocked before the blocklist existed).
2. `Auto-Submitted` present and not `no`, or `Precedence: bulk|list|junk`, or `X-Autoreply`, or `List-Id` present, or empty `Return-Path`, or sender local part `mailer-daemon|postmaster|noreply|no-reply` → create the message (agents still see it) but mark `auto_reply`: **never** acknowledge, never reopen a solved ticket, never trigger notifications.
3. More than 20 emails from the same sender in 60 minutes → `loop`; managers get one alert per hour.
4. `spam_score` above `setting.spam_threshold` (default 5.0) or SPF and DKIM both failing for a domain that publishes DMARC `p=reject` → ticket goes straight to Spam status.
5. `Message-ID` already stored in `inbound_email.message_id_header` with state processed → `duplicate`.

### 2.5 Quote stripping (`body_stripped`)
Cut the text at the first match of, in order:
- the reply delimiter we add to outgoing mail: `##- Reply above this line -##`
- `^On .+ wrote:$` (also the Polish, German, Hungarian equivalents used by our customers: `W dniu .+ napisał`, `Am .+ schrieb`, `.+ írta:`)
- `^-----Original Message-----`, `^From: .+$` followed by `^Sent: ` (Outlook)
- `<div class="gmail_quote">`, `<blockquote type="cite">`, `<div id="divRplyFwdMsg">` in HTML
- signature separator `^-- $`
Keep `body_text` and `body_html` whole; "Show original" displays the stored payload.

## 3. Threading (`lib/commands/inbound/match_ticket.liquid`)

```
input: parsed email
1. TOKEN   recipient local part (from envelope.to, then To, Cc) matches ^[a-z0-9-]+\+t\.(\d+)\.([a-f0-9]{16})$
           → ticket_number, mac;  valid if mac == (ticket_number | compute_hmac: REPLY_TOKEN_SECRET) | slice: 0, 16
           → ticket found → reason "token"
2. HEADER  ids = [In-Reply-To] + References (newest first)
           → message where email_message_id in ids (records filter value_in), newest first
           → skip ids found on > 3 tickets
           → reason "header"
3. SUBJECT subject matches \[#(\d+)\]  → ticket by number
           → accept only if sender is the requester, a participant, or in the ticket's organization (domain)
           → reason "subject"
4. NONE    → new ticket, reason "new"

after a match:
  ticket.category == closed            → new ticket with follow_up_of_id = matched.id, reason "follow_up"
  sender not requester/participant      → add sender as participant (cc), add a system event "added as CC"
  ticket.merged_into_id present         → follow the pointer (max 5 hops)
```

Record the reason on `message.match_reason` and in `inbound_email`. Department for a new ticket: the inbound local part in `envelope.to` → department by `inbound_local_part`, else the default department.

## 4. Outbound

### 4.1 Address and headers (`lib/helpers/email/headers.liquid`)
- `From`: department `from_name <from_address>` (white-label sender name falls back to `<brand name> Support`, 08).
- `Reply-To`: `<inbound_local_part>+t.<number>.<mac16>@<inbound domain>` where `mac16 = (number | compute_hmac: REPLY_TOKEN_SECRET) | slice: 0, 16`.
- `Message-ID`: `<support.<message record id>.<epoch>@<inbound domain>>` — stored on the message before sending.
- `In-Reply-To`: the newest customer `email_message_id` on the ticket.
- `References`: all stored `email_message_id`s of the ticket's public messages, oldest first, max 20 (first + last 19).
- `Subject`: `Re: <original subject>` with `[#<number>]` appended once.
- `X-Auto-Response-Suppress: OOF, AutoReply` and, for system mail (acknowledgement, status updates), `Auto-Submitted: auto-replied`.

### 4.2 SendGrid request (`lib/commands/email/providers/sendgrid/send.liquid`, `graphql/email/sendgrid_send.graphql`)
```graphql
mutation sendgrid_send($url: String!, $body: String!, $headers: HashObject!) {   # $url = email_api_base_url or https://api.sendgrid.com + /v3/mail/send
  api_call_send(api_call: { url: $url, method: "POST", headers: $headers, body: $body }) {
    response { status body }
    errors { message }
  }
}
```
Verify the `api_call_send` payload fields with `pos_gql_type ApiCallSendPayload` before writing. Body (built as a hash literal, then `| json`):
```json
{
  "personalizations": [{ "to": [{ "email": "…", "name": "…" }], "cc": [ … ] }],
  "from": { "email": "support-dob@platformos.com", "name": "DOB Support" },
  "reply_to": { "email": "dob+t.18030.ab12cd34ef56ab78@in.support.platformos.com" },
  "subject": "Re: Payment receipt emails not sending [#18030]",
  "content": [{ "type": "text/plain", "value": "…" }, { "type": "text/html", "value": "…" }],
  "headers": { "Message-ID": "<…>", "In-Reply-To": "<…>", "References": "<…> <…>", "X-Auto-Response-Suppress": "OOF, AutoReply" },
  "custom_args": { "support_message_id": "<record id>" },
  "tracking_settings": { "click_tracking": { "enable": false }, "open_tracking": { "enable": false } }
}
```
- One request per message; never batch recipients across tickets (SendGrid reuses one SMTP id per batch).
- Status 202 → `delivery_state: sent`; 4xx → `failed` + `delivery_error`, agent sees a red "Not sent — retry" on the message; 5xx/timeout → retry via the consumer's `max_attempts` (3).
- Click and open tracking off: rewritten links break replies and look like phishing to city IT.
- **Message-ID (verified in TASK-1):** SendGrid keeps our `Message-ID`, `In-Reply-To`, `References` and `Reply-To` headers unchanged. Store our own Message-ID before sending; threading needs no fallback. The adapter returns SendGrid's `X-Message-Id` as `provider_message_id`.
- **Outbound attachments (decided in TASK-1): A.** The composer reads files client-side and posts base64 alongside the presigned upload; the adapter puts it in Mail Send's `attachments` array (verified: the attachment arrives intact). The composer caps attachments at 10 MB total, because the whole POST must stay under platformOS's ~16 MB request limit.

### 4.3 Templates
`views/partials/support/emails/{reply,acknowledgement,confirmation,status_update,agent_alert}.liquid`, each rendering `subject`, `text`, `html` from passed data. Use translations (`| t`), the brand from `helpers/branding`, inline CSS only, and the reply delimiter line at the top of every customer email that expects a reply.

## 5. Acknowledgement (NT-1)
Consumer `support_ticket_created/send_acknowledgement`: skip if auto-reply, if the ticket came from an agent, or if an acknowledgement went to this sender in the last 24 hours. Content: ticket number, subject, expected first-reply time from the SLA policy, link-free.

## 6. SendGrid Event Webhook (EM-16, Should)
`pages/api/support/email_events.liquid` (`slug: api/support/email-events/:provider/:secret`, `method: post`, `format: json`): secret check as §2.1; for each event with `support_message_id` update `message.delivery_state`; `bounce` with `type: bounce` → `contact.bounced = true`. SendGrid's signed-webhook verification uses ECDSA; until platformOS has a verification filter, the URL secret is the control.
