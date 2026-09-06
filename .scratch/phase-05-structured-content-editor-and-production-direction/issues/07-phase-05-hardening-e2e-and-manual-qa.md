# 07: Harden the Phase 5 structured editor and verify critical journeys

**What to build:** Verify the completed structured Content workflow across its security, concurrency, accessibility, localization, and creator-usability boundaries without expanding Phase 5 scope.

**Blocked by:** 04 — Cut shared Content generation over to V2 mutable Drafts; 05 — Deliver block-local Production Direction authoring; 06 — Deliver Content acceptance and read-only Version History.

**Status:** ready-for-agent

- [ ] Close cross-cutting gaps found in required unit, component, PostgreSQL integration, build, lint, typecheck, and formatting validation.
- [ ] Add only the two approved critical persisted Playwright journeys: one representative EN/LTR and one representative FA/RTL structured-editor flow using deterministic provider wiring.
- [ ] Perform and record concise manual QA for desktop/mobile, long Persian and mixed-direction Script readability, direction density, history clarity, conflict recovery, and destructive safeguards.
- [ ] Run the approved 10–15 minute real-editing exercise to assess whether missing document-wide structural undo feels unsafe or frustrating; report the result without pre-building undo.
- [ ] Verify no Phase 5 non-goal has entered through hardening work.

## Required invariants

- Playwright remains lean and does not duplicate taxonomy, validation, transaction, locale/viewport matrix, or edge-case coverage owned by lower layers.
- No live AI provider is used in normal CI or E2E.
- A blocking regression in correctness, authorization, data integrity, or required EN/FA accessibility prevents Phase 5 closure.

## Test layer

Cross-cutting unit/component/PostgreSQL integration coverage, exactly two representative Playwright journeys, and manual UX QA.
