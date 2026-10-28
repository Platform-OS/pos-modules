---
id: TASK-14
title: 'Notification dispatch, agent alert emails and preferences'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 Defaults: push and email for every event
- [x] #2 Switching push off for assigned stops only that push
- [x] #3 Pause skips both and logs notification_skipped
- [x] #4 Customer emails unaffected by preferences
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added queries/notifications/recipients (07 §1 table), commands/notifications/dispatch (actor excluded; preferences with missing key or channel = on; paused members skipped with a notification_skipped row; 2-minute dedupe per recipient, ticket and event from one lookup; push through push_notifications broadcast by the profile's user id; email through the provider layer), build_message (title from translations, "#n subject", no bodies or customer addresses), send_alert_email with the agent_alert template, notify (skips tickets in inactive departments), and notify_agents consumers for ticket created (new / p0), assigned, customer reply (not the first message, not auto-replies), note mentions, SLA due soon and breached, unassigned escalation and confirmation waiting. The desk gate records the desk's base_url for links in alert emails; the activity log hides notification rows.
Outcome: notifications_test passes (push and email on by default, dedupe, actor not notified, push off for one event keeps email and other events, pause sends nothing and logs the skip, department agents receive "new"). All 17 test files pass. Customer emails do not use dispatch.
Note: before the inactive-department guard, test fixtures triggered 23 real "new ticket" alert emails to the artur+sd-admin alias; the guard stops that and a test run afterwards sent none.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
