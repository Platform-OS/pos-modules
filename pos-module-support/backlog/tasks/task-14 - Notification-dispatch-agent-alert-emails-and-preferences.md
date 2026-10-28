---
id: TASK-14
title: 'Notification dispatch, agent alert emails and preferences'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
dependencies:
  - TASK-13
  - TASK-6
priority: high
ordinal: 1140
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
notifications/dispatch with recipients per event, preferences (missing = on), pause, dedupe, agent_alert email template; consumers for every event in 07 §1.

Spec: tech-spec 07 §1.
Files: public/lib/commands/notifications/dispatch.liquid; public/lib/consumers/*/notify_agents.liquid
Tests: unit per AC; E2E scenario 8
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Defaults: push and email for every event
- [ ] #2 Switching push off for assigned stops only that push
- [ ] #3 Pause skips both and logs notification_skipped
- [ ] #4 Customer emails unaffected by preferences
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
