---
id: TASK-12
title: 'SLA engine, timers and sweep'
status: To Do
assignee: []
created_date: '2026-10-27'
labels:
  - mvp
dependencies:
  - TASK-9
priority: high
ordinal: 1120
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
sla_clock helpers, deadline computation, pause/resume, sla_state, sla/schedule and sla/check jobs keyed by sla_version, maintenance/sweep self-rescheduling job and heartbeat.

Spec: tech-spec 06 §3, 06 §4.
Files: public/lib/helpers/sla_clock.liquid; public/lib/commands/{sla,maintenance}/**; public/migrations/*_support_start_sweep.liquid
Tests: unit SLA set; E2E scenario 6 and 7
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Business-hours math across weekend and holiday
- [ ] #2 Pause in pending shifts resolution; first reply not reset on reopen
- [ ] #3 Stale timer jobs exit when sla_version changed
- [ ] #4 Sweep applies confirmation_mode: auto_close closes at the end of the waiting period; keep_open publishes support_confirmation_waiting once per ticket; sweep writes heartbeat
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
