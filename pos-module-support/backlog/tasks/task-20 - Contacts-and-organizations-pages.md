---
id: TASK-20
title: 'Contacts and organizations pages'
status: Done
assignee:
  - "@arturpawlak"
created_date: '2026-10-27'
labels:
  - mvp
  - ui
dependencies:
  - TASK-5
  - TASK-10
priority: high
ordinal: 1200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Contact page (emails, organization, tickets, merge contacts) and organization page (domains, tier, SLA policy, contacts, tickets).

Spec: tech-spec PRD CO-1..CO-3.
Files: public/views/pages/support-desk/{contacts,organizations}/**
Tests: E2E smoke
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Contact merge moves tickets and emails
- [x] #2 Organization domain edits affect future matching only
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added the contact page (support-desk/contacts/:id: addresses, organization link, blocked/bounced notes, tickets within the member's scope, name/phone edit, add an address, merge into another contact for managers) and the organization page (support-desk/organizations/:id: domains, tier, people, tickets, edit name/domains/tier/SLA policy for managers). Commands contacts/merge (tickets, customer messages and CC rows move with records_update_all; addresses, phone and organization carried over; source deleted; logged), contacts/update and organizations/update (domains lower-cased, validated, de-duplicated, free-mail dropped). The ticket sidebar links to both pages.
Outcome: contacts_pages_test passes (ticket and address follow the merge, source removed; existing contact keeps its organization after a domain change, a new contact on the new domain joins it, gmail.com is dropped); all 21 test files pass; both pages answer 200 for the admin on support-dev.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
