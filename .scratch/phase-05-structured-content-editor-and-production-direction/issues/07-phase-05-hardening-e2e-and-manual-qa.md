# 07: Harden the Phase 5 structured editor and verify critical journeys

**What to build:** Verify the completed structured Content workflow across its security, concurrency, accessibility, localization, and creator-usability boundaries without expanding Phase 5 scope.

**Blocked by:** 04 — Cut shared Content generation over to V2 mutable Drafts; 05 — Deliver block-local Production Direction authoring; 06 — Deliver Content acceptance and read-only Version History.

**Status:** resolved

## Status reconciliation

The implementation notes record completed verification, and the approved Phase
5 specification records the phase as complete. Its original checklist is
preserved as historical execution evidence.

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

## Implementation notes

- Reconciled the 12 obsolete `content-read-service.integration.test.ts` expectations with the post-Ticket-04 invariant: AI Run output and `AI_GENERATED` Version #1 remain V1 while newly generated mutable Drafts are V2.
- Updated legacy/read-save fixtures so V2 Draft persistence, revision conflicts, authorization, ordering, and immutable lineage assertions exercise the canonical V2 boundary without weakening legacy V1 migration coverage.
- Added exactly two persisted Playwright journeys: representative EN/LTR structured editing with a Performance Direction, acceptance, and read-only history; and representative FA/RTL content-language semantics with a localized Edit Direction, acceptance, and history.
- Hardened existing E2E selectors/readiness checks for stable block identity and the human-readable Copy Unsaved export.
- Manual QA assessment: the editor remains Script-first with visually secondary direction controls, compact read-only history, usable narrow/mobile layout, semantic EN/FA content direction, and safe destructive-block confirmation. Native textarea undo was acceptable for ordinary typing; the absence of document-wide structural undo was not materially unsafe during the 10–15 minute edit exercise, so no undo subsystem was introduced.
- Full verification passed: `npm run db:up`, `npm run db:check`, `npm run db:migrate:test`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:e2e`, and `git diff --check`.
