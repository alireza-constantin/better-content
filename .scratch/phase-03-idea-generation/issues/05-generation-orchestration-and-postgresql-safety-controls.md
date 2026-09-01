# 05: Orchestrate safe, idempotent idea generation

**What to build:** An authorized server application service that turns current AI-ready Content DNA into one atomic 20-idea batch using the neutral AI boundary, with idempotency, PostgreSQL quota reservations, lifecycle transitions, stale recovery, and safe failures.

**Blocked by:** 01: Define Idea Generation domain contracts and canonical validation; 02: Add Phase 3 persistence schema and reviewed migration; 03: Establish the provider-neutral AI contract and deterministic fake; 04: Implement the Phase 3 OpenAI adapter and privacy boundary.

**Status:** ready-for-agent

## Goal

Implement the Phase 3 core operation without weakening atomicity, current-DNA, cost, or privacy invariants.

## Scope

- Authorize the generation entrypoint; validate client shape; re-read current Content DNA and call the Phase 2 canonical AI-readiness function.
- Implement fingerprint/idempotency resolution, short-transaction paired PENDING creation/quota reservation, conditional RUNNING transition, external provider call, atomic completion/failure, and opportunistic stale recovery.
- Return application DTOs/errors suitable for UI consumers, safe structured logs, and deterministic-fake integration coverage.

## Relevant source-of-truth references

- `AGENTS.md` §§10–13, 16, 18, 27, 32–35, 39–43, 47–48.
- `docs/PRD.md` §§11–16.
- `docs/ARCHITECTURE.md` §§13–18, 20–29, 77–81, 84–91, 95–96.
- `docs/adr/ADR-011-ai-provider-boundary.md`.
- `docs/adr/ADR-013-content-dna-version-storage.md`.
- `docs/adr/ADR-014-initial-ai-provider-and-model-for-idea-generation.md`.
- `docs/phases/phase-03-idea-generation.md` §§2–10, 14–16.

## Architecture constraints

- UI never calls Drizzle/OpenAI; use domain/application service → AI contract → adapter.
- Reuse Phase 1/2 authorization and AI-readiness services; do not duplicate readiness rules or create generalized RBAC/idempotency/rate-limit infrastructure.
- Provider invocation is strictly outside a database transaction. Every lifecycle update locks/re-reads the paired rows and conditionally expects the prior status.
- Batch owns request/source facts, one AI run owns operational facts, and exactly 20 ideas can appear only in the atomic successful completion transaction.

## Expected behavior

- Require authenticated workspace owner and resource ownership. A missing/incomplete current DNA returns actionable `VALIDATION_ERROR`; stale base version returns `CONFLICT`; invalid language returns validation failure. None invokes the provider or creates a record.
- The base version must equal authoritative current version, be AI_READY, and contain requested `en`/`fa`; count is always server-fixed at 20.
- Resolve same workspace/key/fingerprint replay before quota and return original operation with no provider call/slot. Same key with different fingerprint returns `CONFLICT`.
- For a new key, serialize workspace quota with PostgreSQL lock/equivalent, release stale uninvoked reservations, enforce 3 invoking attempts/10 minutes and 12/24 hours, then atomically create PENDING pair/reservation. Denial creates no batch/run/reservation.
- Just before provider call conditionally transition PENDING pair to RUNNING and mark reservation invoked. Failures after invocation retain quota; a non-invoked failure releases it. No automatic OpenAI retry; user Retry is a distinct new UUID operation.
- On success, re-read locked RUNNING pair and atomically persist canonical snapshot, positions 1–20, exactly 20 ideas, terminal timestamps, and both COMPLETED. If terminal/stale, discard late result and insert zero ideas. Stale PENDING uses `created_at`, RUNNING uses `started_at`, with 75-second cutoff and `FAILED/INTERRUPTED` conditional recovery.

## Persistence requirements

- Use Ticket 02 schema only. Write generated idea facts once; never update title/description/category/language/position after completion.
- Persist only approved safe statuses/categories/settings/neutral usage/canonical snapshot. Map durable categories to stable application errors exactly as Phase 3 §10.

## Authorization requirements

- Reads/mutations must resolve authenticated user + workspace membership + resource ownership; generation requires workspace owner.
- Foreign/private IDs must not reveal existence. Replays are scoped to authorized workspace and original operation.

## EN/FA + RTL/LTR requirements

- Enforce content language independently of UI locale against immutable DNA `contentLanguages`; default selection/UI belongs later. No strings/layout are added here.

## Security/privacy requirements

- Never log/persist raw DNA, prompts, provider envelope/ID/refusal/reasoning/API key; structured logs retain only permitted correlation fields, transition, safe category, and neutral usage.
- Validate all client and provider inputs; never hold a transaction across OpenAI; limit cost/abuse through PostgreSQL reservations only.

## Acceptance criteria

- [ ] Only current AI-ready DNA and one of its configured languages can start; all preflight denials create no batch/run and make no provider call.
- [ ] Same-key replay is side-effect-free and mismatched reuse conflicts.
- [ ] Quota is concurrency-safe in PostgreSQL, has both rolling limits, denies without records, and counts invoked failures.
- [ ] The pair follows only PENDING → RUNNING → COMPLETED/FAILED; stale recovery and completion/failure races cannot create partial success or revive a terminal run.
- [ ] A success atomically creates exactly 20 immutable ideas; invalid output/failure writes zero ideas and has safe durable/application errors.
- [ ] No automatic provider retry, background job, raw data leakage, or transaction-held provider call exists.

## Focused tests

- PostgreSQL integration tests for DNA readiness/current-version/language validation, ownership/isolation, replay/conflict/no-call, both quota windows/concurrency/no-record denial, success atomicity, each failure category/quota retention, stale PENDING/RUNNING release/retention, and completion/recovery late-result races using the deterministic fake.

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

- Batch browsing/detail UI, decisions, all other providers/routing/fallbacks, historical DNA, count selector, languages beyond en/fa or bilingual batches, editing/bulk actions/deduplication, prompt UI, jobs, content, publishing, analytics, and social integrations.

## Dependencies

- 01: Define Idea Generation domain contracts and canonical validation.
- 02: Add Phase 3 persistence schema and reviewed migration.
- 03: Establish the provider-neutral AI contract and deterministic fake.
- 04: Implement the Phase 3 OpenAI adapter and privacy boundary.
