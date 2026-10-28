---
id: TASK-24
title: 'Documentation: README, CLAUDE.md, SKILL.md'
status: Done
assignee: []
created_date: '2026-10-27'
labels:
  - docs
dependencies:
  - TASK-23
priority: medium
ordinal: 1240
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
README (install, SendGrid setup, hooks, events, variables, settings, constants, troubleshooting), final CLAUDE.md, SKILL.md for reuse by agents; copy the tech spec into docs/spec/.

Spec: tech-spec templates/.
Files: README.md, CLAUDE.md, SKILL.md, docs/spec/**
Tests: docs walkthrough on a fresh instance
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A developer can install from README alone on a fresh instance
- [x] #2 SKILL.md hooks and events match the code
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: README rewritten as the installer's guide (requirements, install with the generator, SendGrid setup steps, access model, constants, settings, hooks, events with payloads, routes, troubleshooting, development); SKILL.md for agents (install, access model, branding, hooks, events, rules); CLAUDE.md pointed at docs/spec, the generator, README/SKILL upkeep and the new gotchas; the tech spec copied to docs/spec/ with personal addresses and local paths removed (the repo is public); JSON-from-a-page gotcha added to 12-gotchas (repo copy and Drive).
Outcome: Hooks (support_branding, support_assignment alter, core headscripts), the 16 events with their payloads and the 5 constants in README and SKILL.md were taken from the code (lib/events/*, hook/fire and hook/alter calls, context.constants reads).
Next: AC1 (install from the README alone on a fresh instance) needs a fresh instance; see the TASK-25 report.
<!-- SECTION:FINAL_SUMMARY:END -->
