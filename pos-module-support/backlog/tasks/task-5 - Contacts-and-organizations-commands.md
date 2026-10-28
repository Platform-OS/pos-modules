---
id: TASK-5
title: 'Contacts and organizations commands'
status: To Do
assignee: []
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
- [ ] #1 Same email (case-insensitive) finds the same contact
- [ ] #2 Free-mail domain creates no organization
- [ ] #3 Second email added to a contact is matched later
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
