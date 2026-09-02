# 05: Orchestrate safe, idempotent idea generation

**What to build:** An authorized server application service that turns current AI-ready Content DNA into one atomic 20-idea batch using the neutral AI boundary, with idempotency, PostgreSQL quota reservations, lifecycle transitions, stale recovery, and safe failures.

**Blocked by:** 01: Define Idea Generation domain contracts and canonical validation; 02: Add Phase 3 persistence schema and reviewed migration; 03: Establish the provider-neutral AI contract and deterministic fake; 04: Implement the Phase 3 OpenAI adapter and privacy boundary.

**Status:** resolved

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

## Answer

### Ticket 04 Policy Check

Confirmed the existing adapter matches ADR-014: `gpt-5.6-terra` through the
Responses API, medium reasoning, default service tier, 16,000 output tokens,
`store: false`, explicit prompt-cache mode with no breakpoint/key, a 60-second
timeout, zero automatic retries, strict `idea_generation_v1` output, exactly 20
ideas, and no tools/background/conversation/continuation. No adapter changes
were required.

### Implemented

Implemented Ticket 05 only. Added the authorized idea-generation application
service and PostgreSQL-backed orchestration for current AI-ready DNA, exact-20
requests, workspace-scoped idempotency, quota reservations, lifecycle
transitions, atomic completion/failure, and stale recovery. Added deterministic
PostgreSQL integration coverage for preflight denials, replay/conflict,
success/failure mapping, both quota windows, concurrency, recovery, late
results, and terminal races.

### Application Service

`createIdeaGenerationApplicationService` validates the server input, requires
an authenticated workspace owner, computes the Ticket 01 fingerprint, returns
safe batch/status DTOs, and calls only the provider-neutral
`GenerateIdeasProvider` contract. The default composition in the application
index wires the approved OpenAI adapter without exposing OpenAI types to the
service.

### Authorization / DNA Preconditions

The service requires authentication and owner access before private work. New
operations re-read the authoritative current Content DNA before reservation,
call the canonical Phase 2 readiness function, and require the requested
language in immutable `contentLanguages`. Once the PENDING pair is committed,
the operation remains bound to its recorded immutable DNA version; the
PENDING-to-RUNNING transition checks only the accepted pair and reservation,
not whether the workspace current pointer has changed. Invalid, incomplete,
stale, or unsupported requests before acceptance do not invoke the provider or
reserve quota.

### Idempotency

Same-workspace key lookup occurs before stale recovery and quota evaluation.
Same-fingerprint requests return the original operation without another
provider call or reservation; mismatched fingerprints return `CONFLICT`, and
unexpected uniqueness races resolve to the same safe behavior. Replays remain
workspace-scoped, including failed operations.

### Quota Reservations

A PostgreSQL transaction advisory lock serializes each workspace’s reservation
decision. Invoked reservations and live uninvoked reservations are counted in
the rolling 10-minute/24-hour windows (3/12 limits). Policy denial creates no
batch, run, or reservation. Reservations become consumed only in the
committed PENDING-to-RUNNING transition; uninvoked failures/recovery release
them, while invoked failures retain them.

### Lifecycle / Transactions

Batch and AI run transitions are paired and conditional. PENDING creation,
invocation start, completion, failure, and recovery each use short database
transactions. Provider invocation occurs only after a committed RUNNING state
and never inside an open transaction. No automatic provider retry was added.

### Success Atomicity

Successful provider output is validated again at the neutral boundary, then a
single transaction persists the canonical snapshot, neutral usage, exactly 20
immutable ideas at positions 1–20, initial `NEW` decisions, and both terminal
COMPLETED states. Late results after recovery/other terminal outcomes are
discarded without inserting ideas.

### Failure Mapping

`TIMEOUT`, provider `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `INVALID_OUTPUT`,
and `UNKNOWN` are durably paired on the batch/run and mapped to stable
application errors. Failed attempts persist no output snapshot and no ideas.

### Stale Recovery

Authorized opportunistic recovery fails stale PENDING and RUNNING pairs after
75 seconds with `INTERRUPTED`. PENDING reservations are released; RUNNING
reservations remain consumed. Recovery is exposed for later authorized history
entrypoints without adding a worker or background job.

### Concurrency

The repository uses workspace advisory locking for reservation/start and row
locks for pair lifecycle updates. Integration tests cover concurrent same-key
convergence, concurrent quota reservations, accepted immutable-DNA lineage,
and completion/recovery terminal-winner behavior.

### Logging / Privacy

Only allowlisted structured fields are emitted, including safe workspace,
batch/run, transition, category, and application error correlation. Raw DNA,
prompts, provider envelopes/IDs/refusals/reasoning, secrets, and thrown provider
details are neither persisted nor logged.

### Tests

Added 26 focused PostgreSQL integration tests. The focused suite passes, and
the full deterministic suite passes with 27 test files and 199 tests.

### Verification

- `npm run db:migrate:test` — passed.
- `npm run format:check` — passed.
- `npm run lint` — passed with no warnings.
- `npm run typecheck` — passed.
- `npm run test` — passed: 27 files, 199 tests.
- `npm run build` — passed.
- `git diff --check` — passed.

### Database Changes

None. Ticket 02’s reviewed schema and migration are used unchanged.

### Commit

Final verification passed; this correction is included in the unpublished
Ticket 05 commit.

### Deviations / Risks

The prior start-time DNA revalidation deviation is corrected: after acceptance,
changing the current DNA pointer no longer fails or interrupts the operation,
and the provider receives the immutable payload recorded at acceptance.
`INTERRUPTED` remains limited to stale/interrupted lifecycle recovery. No
Ticket 06 history/decision service, UI, retry UI, job, provider, schema, or
live OpenAI smoke work was started.
