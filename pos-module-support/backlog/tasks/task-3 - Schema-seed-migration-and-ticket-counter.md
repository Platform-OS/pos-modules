---
id: TASK-3
title: 'Schema, seed migration and ticket counter'
status: Done
assignee:
  - "@arturpawlak"
created_date: '2026-10-27'
labels:
  - mvp
dependencies:
  - TASK-2
priority: high
ordinal: 1030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Write the nineteen schema files (block style), the seed migration (statuses, default department, SLA policy, settings, counter) and the categories helper.

Spec: tech-spec 03.
Files: public/schema/*.yml; public/migrations/*_support_seed.liquid; public/lib/helpers/categories.liquid; public/graphql/counters/increment.graphql
Tests: unit: counter, categories, seed idempotency
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All schema files pass validate_code and deploy
- [x] #2 Migration is idempotent (run twice: no duplicates)
- [x] #3 Counter increment returns consecutive numbers under two sequential creates
- [x] #4 categories helper returns the six categories exactly as 03 §4
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: Added the remaining 18 schema files (19 with team_member), commands/seed/defaults with its migration (9 statuses with customer labels, default Support department, default SLA policy with business hours in UTC unless a time zone is given, settings, ticket counter at 1000), commands/counters/next, helpers/categories, and an example-app migration that adds the DOB, Accela and DesksNearMe departments and sets business hours to America/Chicago.
Outcome: Deployed to support-dev; the migration ran once and seeded the data; seed_and_counter_test passes (second seed run creates nothing, nine statuses, one default department, consecutive counter values, six categories). Inserts are batched with records_create, so the seed runs three queries whatever the row count.
Deviations: property names must have one type across all tables (lint ConflictingSchemaPropertyType), so counter.value is `current`, blocked_sender.value is `pattern` and inbound_email.payload is `params_json`; spec 03 updated.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
