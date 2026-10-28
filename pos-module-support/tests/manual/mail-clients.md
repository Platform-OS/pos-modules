# Mail-client matrix (TASK-25 AC2)

Manual check that customer emails from the desk render correctly and that a reply from each client threads back to the same ticket. Run it on `support-dev` with sending enabled (Settings → Email → Enable) and the E2E suite **not** running (the suite routes email to the stub).

## How to run

1. In the desk, open a ticket whose requester is the client's mailbox (send an email to `dob@support-dev.platformos.com` from that mailbox; the ticket appears in the DOB queue).
2. Reply from the ticket with: a paragraph, a bulleted list, a link, a saved reply, and a PNG attachment.
3. In the client, check the items below, then reply from the client (keep the quoted text).
4. In the desk, check that the reply is on the same ticket (no new ticket in the queue), that only the new text is shown, and that "Show original email" shows the full email.

## What to check in each client

- A. Sender shows the department From name and address; Reply-To is `<dept>+t.<number>.<mac>@…` (visible in "show original").
- B. Body renders: paragraphs, list, link, signature; no raw HTML; the "Reply above this line" delimiter is present.
- C. Attachment arrives and opens.
- D. The client groups our replies in one conversation (Message-ID / In-Reply-To / References).
- E. A reply from the client threads to the same ticket in the desk.
- F. Quote stripping: the desk shows only the new text; the full email is under "Show original email".

## Results

| Client | A | B | C | D | E | F | Tested by / date | Notes |
|---|---|---|---|---|---|---|---|---|
| Gmail (web) | – | – | – | – | – | – | not run | |
| Gmail (Android/iOS app) | – | – | – | – | – | – | not run | |
| Outlook (web, outlook.com) | – | – | – | – | – | – | not run | |
| Outlook (Windows desktop) | – | – | – | – | – | – | not run | |
| Apple Mail (macOS) | – | – | – | – | – | – | not run | |
| Apple Mail (iOS) | – | – | – | – | – | – | not run | |

Legend: ✓ pass, ✗ fail (describe in Notes), – not run.

## What the automated suite already covers

- Threading by reply token, by `In-Reply-To`/`References` and by subject, quote stripping for Gmail, Outlook, Apple Mail, Polish/German/Hungarian "wrote:" lines and the reply delimiter: `app/lib/test/support/threading_test.liquid` and `inbound_parse_test.liquid` with the real-client fixtures in `tests/fixtures/email/*.eml`.
- Outgoing headers (Message-ID stored before sending, Reply-To token, In-Reply-To/References on replies) and attachment encoding: `email_outbound_test.liquid` and E2E scenarios 2–3.

These cover the parsing side with captured emails; they do not show how each client renders our HTML or groups the conversation, which is what this matrix is for.
