---
id: DEC-8
title: Email provider chosen per installation at deploy time
date: '2026-10-27'
status: accepted
---

## Context and decision

D-3 (revised 2026-10-27). The module defines an adapter contract (parse_inbound, send, parse_events, setup_instructions, check); the MVP ships the SendGrid adapter. Provider, API key, inbound domain or address, secrets and from-addresses are set by the install generator and Settings → Email, never in module code. Our installation: pOS SendGrid account, in.support.platformos.com.

## Consequences

See the referenced sections of the technical PRD. Record new evidence that contradicts this decision as a new decision rather than editing this one.
