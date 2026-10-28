---
id: TASK-12
title: 'SLA engine, timers and sweep'
status: Done
assignee:
  - "@arturpawlak"
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
- [x] #1 Business-hours math across weekend and holiday
- [x] #2 Pause in pending shifts resolution; first reply not reset on reopen
- [x] #3 Stale timer jobs exit when sla_version changed
- [x] #4 Sweep applies confirmation_mode: auto_close closes at the end of the waiting period; keep_open publishes support_confirmation_waiting once per ticket; sweep writes heartbeat
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added helpers/sla/add_minutes (calendar or business hours walked day by day in the policy time zone, closed days and holidays skipped), queries/sla/policy_for (organization → department → default), commands/sla/compute (deadlines from created_at, resolution shifted by paused time, next reply after the first reply, state on_track/due_soon at 25 %/overdue/paused/met/missed, nearest running deadline), sla/update (pause bookkeeping, write, sla_version bump, due-soon and breach jobs per deadline), sla/check (exits on a stale version or a solved/closed ticket; logs and publishes support_sla_due_soon/support_sla_breached), consumers on ticket created, status and priority changed, message received and reply created, maintenance/sweep (confirmation auto_close/keep_open, expired snoozes, missed deadlines, heartbeat, self-rescheduling chain named in the sweep_chain setting), start_sweep and its migration. New ticket property sla_due_at; the queue sorts by it.
Outcome: sla_test passes on support-dev (Fri 16:00 + 2 h = Mon 10:00 Chicago, Tue with a Monday holiday, Saturday start → Mon 09:30, due-soon at 25 %, overdue, first reply not running again after reopen, pending pause shifts resolution by the paused hour, stale timer exits, keep_open notifies once, auto_close closes). Live: the sweep chain started and wrote its heartbeat; ticket #1082 (P2, Chicago hours) got first reply due next business day 11:19 and resolution 30 business days out.
Deviations: business_minutes_between (reporting) waits for reporting work. The "restart sweep" button belongs to Settings → Integrations (TASK-18).
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
