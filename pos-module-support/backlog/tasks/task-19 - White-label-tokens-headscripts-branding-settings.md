---
id: TASK-19
title: 'White-label: tokens, headscripts, branding settings'
status: Done
assignee:
  - "@arturpawlak"
created_date: '2026-10-27'
labels:
  - mvp
  - ui
dependencies:
  - TASK-2
  - TASK-18
priority: high
ordinal: 1190
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Finish pos-support.css with only var(--pos-*) and the semantic tokens, dark-mode values, documented --pos-support-* variables, Branding settings page with source detection, preview and overrides.

Spec: tech-spec 08.
Files: public/assets/style/pos-support.css; public/views/pages/support-desk/settings/branding.liquid
Tests: E2E scenario 10; contrast check
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Grep shows no hex colours outside the semantic token block
- [x] #2 Example dark host theme renders all screens legibly (4.5:1)
- [x] #3 Override name appears in rail, emails, manifest and push
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Definition of Done in backlog/config.yml met
<!-- DOD:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Done: pos-support.css now uses only var(--pos-*) outside the semantic token block; added SLA tokens and an email-frame token, explicit dark tokens for .pos-theme-dark and the prefers-color-scheme variant for .pos-theme-darkEnabled, SLA state glyphs (meaning not by colour alone) and a readable note timestamp. ci-static.sh fails on any hex colour outside a --pos-support-* definition. Added Settings → Branding (sources detected: host stylesheet, support_branding hook keys, overrides; live preview of rail, button, link, badge and sender name; overrides for desk name, short name, sender name, colours, logo, icon, light/dark mode, with #rrggbb and https checks; "Use the host app's branding" clears them). Push titles now start with the brand's short name. README documents the tokens.
Outcome: A contrast audit in Chromium (every visible text node, 4.5:1 or 3:1 for large text) on the queue, a ticket, the profile, Statuses and Branding finds no failures in light and dark mode. branding_test passes (override reaches the brand used by rail, manifest and emails, and the push title; bad colour and non-https logo refused; host branding restored). The hex check was shown to fail on an injected colour. All 20 test files pass.
Next: None.
<!-- SECTION:FINAL_SUMMARY:END -->
