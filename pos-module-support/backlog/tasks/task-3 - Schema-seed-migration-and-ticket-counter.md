---
id: TASK-3
title: 'Schema, seed migration and ticket counter'
status: To Do
assignee: []
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
- [ ] #1 All schema files pass validate_code and deploy
- [ ] #2 Migration is idempotent (run twice: no duplicates)
- [ ] #3 Counter increment returns consecutive numbers under two sequential creates
- [ ] #4 categories helper returns the six categories exactly as 03 §4
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
<!-- Done / Outcome / Next -->
<!-- SECTION:FINAL_SUMMARY:END -->
