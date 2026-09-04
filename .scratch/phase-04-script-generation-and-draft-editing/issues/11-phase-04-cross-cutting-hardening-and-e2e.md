# 11 — Cross-cutting Phase 4 hardening and verification

**What to build:** Verify and harden the assembled Phase 4 implementation across the complete deterministic browser matrix, database/application boundaries, production provider composition, internationalization, accessibility, security, autosave concurrency, and the opt-in live AvalAI smoke, then mark implementation Ready for review without declaring Phase 4 Complete.

**Blocked by:** 09 — Deliver the reusable Generate Script UI and synchronous operation feedback; 10 — Deliver the Content list and Script editor with serialized autosave; 12 — Add the compact workspace-wide Idea Library and status views; future Ticket 13 — Deliver the Production Queue and compact Idea → Content workflow.

**Status:** ready-for-agent

## Goal

Produce complete Phase 4 implementation evidence at stable seams without turning hardening into a container for missing core behavior or replacing the final Product Architect closure review.

## Scope

- Run the complete deterministic accepted Idea → generation → editor → autosave journey through browser and real application/database boundaries.
- Verify the corrected compact workspace-wide Idea Library as the one primary Ideas
  surface: `All`, `New`, `Saved`, `Accepted`, and `Rejected` status filters;
  `All runs` and owned Past Runs filters; `New + All runs` as the default;
  combined status/run behavior; compact queue/Content state; queue generation
  using the reusable Generate Script capability; authorization/nondisclosure; and EN/FA
  LTR/RTL behavior.
- Add only missing integration/component/E2E coverage enumerated by Phase 4 §31.
- Stress same-key, quota, terminal-winner, immutable-lineage, and Draft-revision concurrency.
- Verify workspace nondisclosure at reads, replay, Attempt instructions, generation, retry, Content, and Draft mutation boundaries.
- Verify normal CI and Playwright can select only the guarded deterministic fake and make zero AvalAI calls.
- Verify complete EN/FA, LTR/RTL, content-language direction, mixed bidi, keyboard/focus/status, and desktop/mobile matrix.
- Verify distinct safe UX for application `RATE_LIMITED` source WORKSPACE versus PROVIDER, plus retry and INTERRUPTED-state behavior.
- Verify autosave failure preservation and a real two-tab optimistic-revision conflict.
- Verify production composition selects the ADR-016 AvalAI adapter while provider/SDK types remain confined to infrastructure.
- Audit logs, DTOs, markup, errors, and persistence for forbidden raw/sensitive/provider data.
- Audit every explicit Phase 4 non-goal and remove accidental scope creep.
- Run the Phase-4-specific opt-in live AvalAI smoke through the dedicated `ai:avalai:content-script:smoke` command for EN SHORT, FA SHORT, EN LONG, and FA LONG; keep it outside normal CI and do not repurpose the existing Phase 3 Idea-generation smoke command.
- Run the complete format, lint, typecheck, unit, integration, build, E2E, and diff verification set.
- Record Phase 4 implementation as Ready for review only when all ticket criteria pass.

## Explicit non-goals

- Implementing omitted core behavior that belongs in Tickets 01–10 without updating the blocker/ticket record first.
- Declaring Phase 4 Complete or performing the final Product Architect closure review.
- Performance/Edit Direction, blocks, anchors, acceptance, publishing, analytics, AI editing, jobs, polling, cancellation, collaboration, or other Phase 5+ work.
- Broad unrelated refactors or new dependencies for test convenience.

## Source-of-truth references

- Phase 4 in full, especially §§7, 27–33.
- PRD §§49–60 and 62–63.
- Architecture §§71–101, 103–105, 108, and 112.
- ADR-002–005, ADR-009–016 as applicable.
- AGENTS.md testing, security, i18n, accessibility, scope, and completion rules.
- Frontend standards and existing Phase 3 deterministic E2E/provider-telemetry patterns.

## Required behavior

- Browser success invokes the deterministic neutral provider once, persists the exact lineage/artifacts, redirects after completion, edits/autosaves, and appears first by Draft last-edited time.
- The final hardening evidence verifies all five Library status views, the
  `New + All runs` default, cross-batch and selected-run retrieval without
  leaving the Library, derived zero/one/multiple Content state, integrated
  Past Runs provenance, compact Idea-to-Queue handoff and queue generation,
  membership/nondisclosure, and English/Persian LTR/RTL behavior.
- Ineligible/stale/quota/foreign failures have the exact zero-side-effect guarantees.
- Provider failures and stale recovery retain history with no artifacts and correct safe Retry behavior.
- Stored PENDING/RUNNING records render without polling, jobs, split endpoints, `after()`, `waitUntil()`, or simulated background execution.
- Two-tab revision conflict retains unsaved local text and cannot overwrite the winner.
- No test relies on timing races without deterministic control where a stable seam is available.
- Automated tests use the fake provider composition and prove normal CI sends no AvalAI request.
- Production composition uses AvalAI behind the provider-neutral contract without leaking provider types upward.
- The opt-in live smoke covers exactly the four accepted language/format combinations with synthetic non-sensitive data.
- A live-smoke contract failure blocks Ready-for-review status and requires ADR-016 review; it does not authorize fallback or relaxed provider policy.

## Persistence constraints

- Re-run all migration, constraint, immutability, atomicity, quota, idempotency, and concurrency tests on the integrated tree.
- Verify no raw prompt/provider material and no prohibited future-phase column/table entered persistence.

## Security and authorization requirements

- Test authentication + membership + ownership for every private read/mutation.
- Confirm nondisclosure and authorization-before-replay/instruction behavior.
- Confirm provider secrets/HMAC/raw errors never enter browser, logs, fixtures committed with secrets, or persisted rows.

## EN/FA and RTL/LTR requirements

- Exercise complete workflows in English/LTR and Persian/RTL at representative mobile and desktop widths.
- Cross UI locale with Content language in both directions and preserve mixed text.
- Accessibility checks include native keyboard activation, focus entry/restoration, associated errors, live statuses, non-color-only states, semantic headings, and touch targets.

## Acceptance criteria

- [ ] Every Phase 4 §31 unit/integration/component/E2E case is covered at its highest stable seam with no live AvalAI dependency in automated tests.
- [ ] The corrected compact workspace-wide Idea Library passes final verification for
      `All`, `New`, `Saved`, `Accepted`, and `Rejected`; defaults to `New + All
      runs`; combines status with `All runs` or an owned Past Run; retrieves
      Ideas across batches and within a run without leaving the Library; shows
      compact queue/Content state and derived Content count including multiple
      Content records; exposes batch provenance through integrated Past Runs;
      verifies queue generation using the reusable Generate Script capability;
      preserves authorization/
      nondisclosure; and works in EN/LTR and FA/RTL.
- [ ] Browser telemetry proves deterministic tests invoke the fake and issue zero requests to AvalAI.
- [ ] Production composition selects the accepted AvalAI Content Script adapter and no AvalAI/OpenAI SDK type escapes infrastructure.
- [ ] Cross-workspace nondisclosure and all zero-side-effect failure cases pass through real application/database boundaries.
- [ ] Idempotency, both quota windows, stale recovery, terminal winner, atomic artifacts, immutability, and Draft concurrency remain green under race tests.
- [ ] Full EN/LTR and FA/RTL workflows, Content-language direction independent of UI locale, mixed bidi, keyboard/focus/accessibility, and responsive desktop/mobile review pass.
- [ ] WORKSPACE-versus-PROVIDER rate-limit UX, retry, and INTERRUPTED-state behavior are distinct, safe, and tested.
- [ ] Autosave failure preserves local text and a two-tab conflict preserves the losing tab’s unsaved text without overwriting the winner.
- [ ] Safe logs/errors/DTOs/markup/persistence expose none of the forbidden raw or sensitive fields.
- [ ] The opt-in synthetic-data AvalAI smoke passes EN SHORT, FA SHORT, EN LONG, and FA LONG through the dedicated `ai:avalai:content-script:smoke` command; it cannot run in normal CI accidentally and does not alter the Phase 3 smoke command.
- [ ] Any live-smoke contract failure blocks Ready-for-review status and is reported for ADR-016 review without adding fallback behavior.
- [ ] Formatting, lint, typecheck, unit/integration tests, build, E2E, and diff checks all pass.
- [ ] Audit confirms every explicit Phase 4 non-goal remains absent.
- [ ] The ticket records Phase 4 implementation as Ready for review and does not declare the phase Complete.

## Required tests

- **Unit:** full deterministic suite and any missing boundary/privacy cases.
- **Integration:** complete schema/application race, authorization, lineage, quota, recovery, retry, and revision matrix.
- **Component:** complete generation/list/editor state, locale, direction, keyboard, and announcement matrix.
- **E2E:** all minimum scenarios in Phase 4 §31, including real browser-triggered deterministic generation, both rate-limit sources, retry/interrupted states, autosave failure, two-tab conflict, locales/directions, accessibility, and responsive layouts.
- **E2E:** additionally verify the corrected compact workspace-wide Library flow across
  all five status views, the `New + All runs` default, cross-batch and
  selected-run retrieval, status/run preservation and clearing, derived Content
  count/state, integrated Past Runs provenance, compact Idea-to-Queue handoff,
  queue generation/retry, authorization/nondisclosure, and EN/FA LTR/RTL behavior.
- **Live smoke:** explicit opt-in EN/FA × SHORT/LONG execution with synthetic data; never a normal CI test.

## Dependencies and blockers

- Blocked by Tickets 09, 10, and 12, and by future Ticket 13; transitively requires Tickets 01–08. Ticket 11 must not begin until both Ticket 12 and Ticket 13 are resolved.
- This is the final implementation ticket. Final Product Architect closure review occurs afterward and is not an implementation ticket.

## Expected verification commands

```text
npm run db:up
npm run db:check
npm run db:migrate:test
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run ai:avalai:content-script:smoke
git diff --check
git status --short
```
