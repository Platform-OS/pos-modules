---
id: DEC-10
title: Board view, blocklist and inbound secret rotation
date: '2026-10-27'
status: accepted
---

## Context and decision

D-26, D-27, D-28 (2026-10-28, from JJ's parallel build). Board: a column per status, drag or Move to, cards sorted P0→P3 then newest first, no manual order. Blocklist: address or domain, refused before storage; Mark as spam blocks the address only. Rotate secret updates the provider through its API and accepts the old secret for 24 h.

## Consequences

See the referenced sections of the technical PRD. Record new evidence that contradicts this decision as a new decision rather than editing this one.
