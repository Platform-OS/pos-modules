---
id: TASK-27
title: 'Our installation app and go-live on the new desk (no migration)'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - ops
dependencies:
  - TASK-26
priority: medium
ordinal: 1270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create our installation app (new private repo and instance), install the module, run the generator (SendGrid + in.support.platformos.com, our branding hook), create departments DOB/Accela/DesksNearMe and agents, complete the Settings → Email setup, and start using it for new tickets while Zoho keeps its history. No Zoho data is imported here.

Spec: tech-spec 04 §0.1, 13 §1.
Files: installation repo
Tests: PRD acceptance list on the installation
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Settings → Email shows Connected; a real email to each department creates a ticket
- [ ] #2 Agents receive push and email alerts on their devices
- [ ] #3 Support manager works a week on the new desk
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
