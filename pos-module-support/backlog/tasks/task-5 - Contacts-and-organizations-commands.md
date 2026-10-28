---
id: TASK-5
title: 'Contacts and organizations commands'
status: Done
assignee:
  - "@arturpawlak"
created_date: '2026-10-27'
labels:
  - mvp
dependencies:
  - TASK-3
priority: high
ordinal: 1050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
contacts/find_or_create, organizations/find_or_create with free-mail exclusion, participants/add|remove.

Spec: tech-spec 05 §1.
Files: public/lib/commands/{contacts,organizations,participants}/**
Tests: unit tests per AC
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Same email (case-insensitive) finds the same contact
- [x] #2 Free-mail domain creates no organization
- [x] #3 Second email added to a contact is matched later
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added contacts/find_or_create (lower-cased, matched with array_overlaps on emails, organization from the email domain), contacts/add_email (refuses an address another contact owns), organizations/find_or_create (null for free-mail domains from the settings list), participants/add (idempotent per ticket, email and role) and participants/remove, with their GraphQL.
Outcome: contacts_test passes on support-dev: upper-case email finds the same contact, a second address is matched later and cannot be added twice, colleagues on the same domain share an organization, gmail.com gets no organization, invalid addresses are refused, participant add is idempotent and remove deletes.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
