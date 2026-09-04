# 07 — Deliver authorized Content reads, Attempt history, and retry

**What to build:** Add nondisclosing application services and browser-facing DTO/action boundaries for Content list/detail, source-Idea Content/Attempt history, persisted active/failed/completed states, derived result lookup/USED, and explicit failed-Attempt retry using current eligibility and a fresh idempotency key.

**Blocked by:** 06 — Execute generation and create Content artifacts atomically.

**Status:** resolved

## Goal

Expose all server-authoritative data and recovery operations needed by the Phase 4 UI without leaking persistence/provider details or inventing client-side workflow rules.

## Scope

- Add newest-first source-Idea Attempt history/detail including canonical request inputs and derived optional result Content.
- Add workspace Content list ordered by Draft `updatedAt` descending and minimal Content/editor-detail DTOs.
- Represent persisted PENDING/RUNNING/FAILED/COMPLETED states and safe localized-ready error codes.
- Derive Idea USED from linked Content existence without changing Idea status.
- Add retry for FAILED Attempts only through the ordinary new-request acceptance path.
- Generate/accept a fresh retry idempotency UUID at an implementation-chosen tier without encoding that choice as domain policy.
- Add authorized opportunistic stale recovery at appropriate read/history entrypoints.
- Provide server actions/adapters with stable safe result unions; keep business logic in application services.

## Explicit non-goals

- Pages/components, polling, background work, cancellation, automatic retry, AI rewrite/regeneration, Content history/diff UI, or Draft save behavior.
- Instructions in Content list/editor or general AI metadata.
- Search, filter, archive/delete, title, folders, queue, or metrics.

## Source-of-truth references

- Phase 4 §§8–9, 12, 14, 20, 23–25, 27, 29, 31, and relevant acceptance criteria.
- Architecture §§13, 27–30, 71, 80, 84–91, and 103–104.
- ADR-002, ADR-003, ADR-005, ADR-010, ADR-011, and ADR-016.
- Existing Phase 3 history/detail/retry/decision DTO and service patterns.

## Required behavior

- Membership permits reads; V1 owner authority is required for retry.
- Attempt result is derived from Content `sourceGenerationAttemptId`; no write-back result column is added.
- FAILED Attempts remain in authorized source-Idea history but never appear in Content list.
- Content list shows only source Idea title, format, immutable Content language, and Draft last-edited time; ordering uses Draft `updatedAt`.
- Persisted PENDING/RUNNING Attempts renderable from DTOs without polling or triggering provider work except stale recovery rules.
- Retry preserves original history, is available only for FAILED, and creates a distinct Attempt/AI Run after current ACCEPTED Idea, current AI-ready DNA, current language support, and quota checks.
- Retry reuses source Idea/language/format/canonical instructions but binds current DNA.
- Retry preflight failure creates no new operation/reservation/invocation.
- One accepted Idea can list multiple independent Content results.

## Persistence constraints

- Reads are repository/query functions inside the Content module and return explicit DTOs.
- Content list never touches Content timestamps during Draft autosave.
- Retry delegates to the same acceptance/orchestration path rather than copying invariants.
- Attempt instructions appear only in authorized Attempt detail/history DTOs.

## Security and authorization requirements

- Authorization occurs before replay, Attempt instructions, result IDs, or nested data are returned.
- Cross-workspace IDs return the repository-standard nondisclosing result.
- Server actions accept minimal inputs and never expose provider metadata, raw AI data, or private DB rows.

## EN/FA and RTL/LTR requirements

- DTOs carry content language and stable codes; they do not localize or mutate creator data.
- Dates are returned in a presentation-safe form following existing locale-page conventions.

## Acceptance criteria

- [ ] Authorized history/detail returns every Attempt state, canonical inputs, and zero/one derived result.
- [ ] Content list is workspace-isolated and sorted by Draft `updatedAt` descending with only approved metadata.
- [ ] Failed Attempts are absent from Content list and retained in Idea history.
- [ ] Multiple Content records from one accepted Idea are represented independently and USED remains derived.
- [ ] Retry only accepts FAILED, preserves original records, and creates a new Attempt/AI Run with a fresh key.
- [ ] Retry rechecks and binds current eligible state; every preflight denial has zero new side effects.
- [ ] Stale reads recover eligible active operations without invoking a provider or adding a worker.
- [ ] Foreign IDs, including replay/instruction reads, remain nondisclosing.

## Required tests

- **Unit:** DTO shaping, state/error/result unions, retry input derivation.
- **Integration:** list order and isolation; history/detail states; derived results/USED; retry success and every rejection; stale recovery; nondisclosure.
- **Component:** not required.
- **E2E:** deferred to Tickets 09–11.

## Dependencies and blockers

- Blocked by Ticket 06.
- Blocks Tickets 09 and 10.

## Expected verification commands

```text
npm run db:up
npm run db:check
npm run db:migrate:test
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```
