# 06: Deliver authorized batch history, detail, retry, and idea decisions

**What to build:** Application services and DTOs that let an authorized workspace owner inspect safe batch history/detail, recover stale attempts opportunistically, retry with a new operation, and classify individual ideas without changing generated facts.

**Blocked by:** 05: Orchestrate safe, idempotent idea generation.

**Status:** resolved

## Goal

Complete the server-side product surface around completed, failed, and active idea-generation operations before the UI consumes it.

## Scope

- Add authorized newest-first batch history and safe batch-detail DTO/query services.
- Integrate opportunistic stale recovery at relevant history/detail/retry entrypoints through the Ticket 05 lifecycle service.
- Add individual decision services for Accept, Save for later, and Reject with optional reason; route Retry through generation as a new UUID operation.

## Relevant source-of-truth references

- `AGENTS.md` §§9–13, 15–18, 39–43, 44–48.
- `docs/PRD.md` §§12–16.
- `docs/ARCHITECTURE.md` §§13, 26–29, 72–75, 77–81, 84–90, 95.
- `docs/adr/ADR-011-ai-provider-boundary.md`.
- `docs/adr/ADR-013-content-dna-version-storage.md`.
- `docs/adr/ADR-014-initial-ai-provider-and-model-for-idea-generation.md`.
- `docs/phases/phase-03-idea-generation.md` §§2–4, 7, 9–12, 14–16.

## Architecture constraints

- Query/mutation services own authorization and DTO shaping; React may consume DTOs but never Drizzle.
- Resolve idea ownership through `Idea → Batch → Workspace`, never through an idea workspace column.
- Use the Ticket 05 lifecycle/retry path; do not duplicate stale recovery, idempotency, quota, or provider behavior.
- `USED` remains derived/not persisted; no content reference exists in Phase 3.

## Expected behavior

- History is workspace-scoped/newest-first and safely exposes date/time, result, DNA version number, requested language, and count. Initial normal view selects newest successful batch; a just-started or failed operation remains visible.
- Detail exposes exactly 20 ideas with current decisions when completed; active operations are in progress; failed operations expose safe failure information and Retry only—never provider internals.
- Each Phase 3 stored decision can directly become any other stored decision. Same-state submission is no-op where practical; reject reason is optional ≤500, blank-able, and cleared atomically on leaving `REJECTED`.
- Retry has a new idempotency key and therefore a new batch/run only after current validation/quota checks; it is never a replay or automatic retry.

## Persistence requirements

- Query Ticket 02 tables through module-level repository/query functions. Decision mutations may update only `status`, `status_changed_at`, `rejection_reason`, and normal mutable timestamps.
- Do not mutate generated title/description/category/language/position, output snapshot, DNA lineage, batch request facts, run execution history, or create decision event/history records.

## Authorization requirements

- Reads require authenticated membership plus batch-derived resource ownership; decisions and Retry require workspace owner. Return non-enumerating authorization/not-found outcomes for foreign IDs.

## EN/FA + RTL/LTR requirements

- DTOs keep UI locale separate from stored generation/idea language and creator text. User-facing localization/layout is deferred to Ticket 07.

## Security/privacy requirements

- Exclude raw prompts, DNA payloads, provider envelopes/IDs, refusal text, hidden reasoning, and unsafe error data from all DTOs/logs.
- Validate decision/reason inputs server-side and preserve cross-workspace isolation.

## Acceptance criteria

- [ ] Authorized owner sees only its workspace’s newest-first safe history and the specified active/failed/completed details.
- [ ] Foreign batch/idea IDs neither mutate data nor reveal private existence.
- [ ] Decision mutations preserve generated immutability, reject reason rules, and direct state transitions; `USED` is not stored.
- [ ] Retry uses the Ticket 05 new-operation semantics, and entrypoints safely trigger stale recovery without re-calling a provider.
- [ ] DTOs contain only safe display/application data and no Drizzle/provider leakage.

## Focused tests

- Integration tests for history ordering, newest-successful selection DTO, safe failed/active detail, ownership/cross-workspace isolation, each direct decision/no-op/reason-clearing transition, Retry new key, and stale recovery at entrypoints.

## Required final verification commands

```text
npm run db:migrate:test
npm run format:check
npm run lint
npm run typecheck
npm run test
git diff --check
```

## Explicit out of scope

- Ideas UI implementation, idea text editing, bulk decisions, decision history/events, deletion/archive/search/filters/comparison/quality score, content generation/USED derivation implementation, providers/routing/fallbacks, jobs, publishing, analytics, and social integrations.

## Dependencies

- 05: Orchestrate safe, idempotent idea generation.

## Answer

Implemented Ticket 06 only. Added authorized newest-first batch history and
safe detail DTOs, newest-operation selection, opportunistic stale recovery,
owner-only retry through a new UUID operation, and owner-authorized individual
idea decisions. Decision updates preserve generated facts, support direct
state transitions, clear rejection reasons when leaving `REJECTED`, and treat
unchanged submissions as no-ops. Added PostgreSQL integration coverage for
history/detail selection, stale recovery, safe failures, retry lineage,
decision transitions/reason validation, and cross-workspace isolation.

Verification passed: `npm run db:migrate:test`, `npm run format:check`,
`npm run lint`, `npm run typecheck`, `npm run test` (28 files, 205 tests),
`npm run build`, and `git diff --check`.
