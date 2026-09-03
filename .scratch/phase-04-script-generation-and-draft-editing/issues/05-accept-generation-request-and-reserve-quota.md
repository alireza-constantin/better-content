# 05 — Accept Content-generation requests and reserve quota safely

**What to build:** Add the authoritative application/repository path that validates an owner’s new request, resolves replay before mutable checks, binds the current AI-ready DNA, enforces accepted-Idea and same-workspace lineage, reserves Content quota, and atomically creates one PENDING Attempt with exactly one PENDING AI Run.

**Blocked by:** 02 — Establish Content-generation persistence and database invariants.

**Status:** resolved

## Goal

Make operation acceptance concurrency-safe and side-effect-free on every rejection before any provider invocation can occur.

## Scope

- Implement canonical request parsing, fingerprinting, workspace-scoped idempotency lookup, and safe replay/mismatch behavior.
- Implement the exact acceptance order and a short PostgreSQL transaction.
- Verify owner authority, Idea → Batch → Workspace ownership, ACCEPTED state, current Content DNA, AI readiness, base-version match, and requested-language support.
- Reuse the Phase 2 authoritative readiness function.
- Implement the Content-specific 2/10-minute and 8/24-hour reservation policy using the proven Phase 3 PostgreSQL concurrency pattern.
- Create PENDING Attempt, exactly one PENDING AI Run, and live quota reservation atomically.
- Make stale PENDING recovery an explicit quota-acceptance responsibility: using shared lifecycle repository primitives, atomically transition each eligible stale PENDING Attempt and AI Run to FAILED / INTERRUPTED and release its uninvoked reservation before that capacity is reclaimed.

## Explicit non-goals

- Starting/invoking the provider, RUNNING stale recovery, late-result/completion races, retry, UI, Content artifacts, or background jobs.
- Rechecking current DNA after acceptance.
- Reusing Idea-generation quota tables or adding Redis/jobs.
- Automatically generating when an Idea becomes ACCEPTED.

## Source-of-truth references

- Phase 4 §§10–15 and 21–23; acceptance criteria “Eligibility, lineage, and acceptance” and first nine lifecycle criteria.
- PRD §§17–18, 47, 54, 56, and 62.
- Architecture §§13, 17–19, 29A, 71, 76–81, 84–91, and 101.
- ADR-002, ADR-005, ADR-010, ADR-011, ADR-013, and ADR-016.
- Existing Phase 3 generation preflight, advisory-lock, idempotency, and quota-reservation patterns.

## Required behavior

- Authenticate and authorize current workspace ownership before returning replay details or instructions.
- Exact same-key/same-fingerprint replay returns the original Attempt before reevaluating Idea/DNA/quota and creates/invokes nothing.
- Same key/different fingerprint returns CONFLICT.
- A new key accepts only an ACCEPTED Idea from the same workspace.
- Current DNA must exist, be AI_READY, match `baseContentDnaVersionId`, and support requested language.
- Acceptance binds the exact immutable current DNA version; no later pointer check is part of this slice.
- Workspace quota is independent from Ideas and other workspaces; denial returns `RATE_LIMITED` with source WORKSPACE and creates no durable operation or provider telemetry.
- Quota acceptance may recover eligible stale PENDING operations. Recovery must change the Attempt and its AI Run to FAILED / INTERRUPTED and release the uninvoked reservation in the same transaction.
- A reservation is never released while its Attempt or AI Run remains active. Ticket 06 separately owns stale RUNNING recovery and completion/late-result races.
- PENDING and RUNNING recovery use shared lifecycle repository primitives rather than parallel transition implementations.
- Concurrent duplicate and quota requests converge under PostgreSQL locking/uniqueness.

## Persistence constraints

- Attempt business/lineage fields and paired AI Run settings are fixed at creation.
- Reservation, Attempt, and AI Run creation commit atomically.
- Failed preflight/reservation leaves no Attempt, AI Run, or live quota effect.
- Stale PENDING recovery atomically persists both FAILED / INTERRUPTED lifecycle transitions and reservation release; partial recovery is forbidden.
- AI Run stores operational policy, not duplicated request inputs or raw bodies.

## Security and authorization requirements

- Client workspace/Idea/DNA IDs never prove ownership.
- Foreign or cross-workspace nested IDs produce nondisclosing outcomes.
- Authentication/authorization precedes replay result disclosure.
- Logs contain allowlisted IDs/categories only; no Idea, DNA, instructions, prompt, or secrets.

## EN/FA and RTL/LTR requirements

- Requested language may differ from Idea language and UI locale.
- Only a language present in the accepted current DNA’s `contentLanguages` is eligible.
- No locale text or direction is persisted in the request.

## Acceptance criteria

- [ ] ACCEPTED is the only eligible Idea state; NEW/SAVED/REJECTED produce zero operational side effects.
- [ ] Accepting an Idea alone continues to create no Attempt or Content.
- [ ] Same-workspace Idea lineage and current-DNA ownership are proven transactionally.
- [ ] Stale base DNA returns CONFLICT with zero Attempt, AI Run, reservation, and provider invocation.
- [ ] Accepted Attempt stores the exact current AI-ready DNA version, not the Idea batch’s historical version.
- [ ] Same-key replay and mismatch ordering exactly match Phase 4 §21, including under concurrency.
- [ ] Quota enforces 2/10 minutes and 8/24 hours per workspace under concurrency and is separate from Idea quota.
- [ ] Stale PENDING recovery atomically transitions the Attempt and AI Run to FAILED / INTERRUPTED and releases the uninvoked reservation before quota is reclaimed.
- [ ] No test or repository path can release a reservation while leaving an active PENDING Attempt/AI Run.
- [ ] Live/uninvoked reservation behavior and workspace isolation are integration-tested.
- [ ] Every accepted Attempt has exactly one same-workspace PENDING AI Run and one live reservation.

## Required tests

- **Unit:** request parsing, error/result mapping, fingerprint integration with Ticket 01.
- **Integration:** each Idea state; cross-workspace IDs; DNA readiness/base/language cases; replay/mismatch; concurrent duplicates; both quota windows; workspace isolation; atomic rollback; atomic stale-PENDING Attempt/AI Run failure plus reservation release; rollback proving no active PENDING pair can lose its reservation.
- **Component:** not required.
- **E2E:** deferred to Tickets 09 and 11.

## Dependencies and blockers

- Blocked by Ticket 02.
- Uses Ticket 01 contracts.
- Blocks Ticket 06.

## Answer

Implemented Ticket 05 only. Added the Content application acceptance service
and repository under `src/modules/content/application/`.

1. The application boundary authenticates and authorizes the current workspace
owner, canonicalizes the request with Ticket 01 rules, computes the workspace-
scoped fingerprint, and returns replay/conflict before mutable validation or
quota evaluation. The repository performs the remaining checks and writes in
one short PostgreSQL transaction.
2. Same-key/same-fingerprint requests return the original Attempt; mismatches
return `CONFLICT`. Replay does not recheck Idea state, DNA, language support,
or quota.
3. New requests require an `ACCEPTED` Idea whose batch belongs to the requested
workspace. The repository resolves the authoritative current DNA, reuses the
Phase 2 `getContentDnaReadiness` function, requires `AI_READY`, matches the
submitted base version, and checks requested-language support. The Attempt
stores the current immutable DNA version, never the Idea batch's historical
version.
4. Content quota uses its separate reservation table with PostgreSQL advisory
workspace serialization: 2 live/invoked slots per rolling 10 minutes and 8
per rolling 24 hours. Denial maps to `RATE_LIMITED` with source `workspace`.
5. Quota acceptance recovers stale PENDING pairs at 105 seconds through a
shared conditional paired-failure primitive, setting Attempt and AI Run to
`FAILED` / `INTERRUPTED` and releasing only the uninvoked reservation. No
provider is called and concurrent recovery is safe.
6. Successful acceptance creates exactly one PENDING Attempt, one same-
workspace PENDING `CONTENT_SCRIPT_GENERATION` AI Run with ADR-016 settings,
and one live reservation. No Content, Draft, Content Version, prompt, output,
or provider telemetry is created.

Added 19 deterministic PostgreSQL integration tests covering eligibility,
ownership/nondisclosure, current DNA/readiness and lineage, idempotency,
quota windows/isolation/concurrency, stale recovery, side-effect-free Idea
acceptance, and transaction rollback.

Verification: `db:up`, `db:check`, `db:migrate:test`, `format:check`, `lint`,
`typecheck`, `test` (27 unit files / 228 tests and 9 integration files / 107
tests), `build`, focused Ticket 05 tests, and `git diff --check` passed.

The AvalAI/fake provider, RUNNING recovery, retry, Content artifacts, routes,
UI, and Ticket 06 work remain unimplemented by design.

## Expected verification commands

```text
npm run db:up
npm run db:check
npm run db:migrate:test
npm run format:check
npm run lint
npm run typecheck
npm run test
git diff --check
```
