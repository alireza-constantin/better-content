# 06 — Execute generation and create Content artifacts atomically

**What to build:** Complete an accepted operation through RUNNING provider invocation and one terminal winner, creating Content, its mutable Draft, and immutable AI-generated Version #1 in one short success transaction or recording a safe failure with no artifacts.

**Blocked by:** 03 — Add the provider-neutral Content Script boundary and deterministic fake; 05 — Accept Content-generation requests and reserve quota safely.

**Status:** resolved

## Goal

Deliver the central accepted-Idea → Attempt → AI Run → Content/Draft/Version #1 workflow against a deterministic provider, including failure, recovery, and race correctness.

## Scope

- Transition the paired Attempt/AI Run from PENDING to RUNNING immediately before invocation and atomically mark quota invoked.
- Call one neutral provider outside all database transactions with the accepted immutable Idea/DNA/request inputs.
- Apply the 90-second deadline and zero automatic provider retries.
- Canonically validate provider output again before persistence.
- Atomically create Content, Draft revision 1, immutable Version #1, AI Run output/usage/correlation, and paired COMPLETED states.
- For provider, validation, and domain failures, durably record mapped paired FAILED states without Content artifacts whenever persistence is available.
- Implement authorized opportunistic stale RUNNING recovery at 105 seconds and terminal-winner handling. Ticket 05 owns stale PENDING recovery.
- Treat failure of the database/final persistence transaction as an uncommitted persistence failure: commit no partial artifacts, do not claim a durable FAILED transition, and allow the operation to remain RUNNING for later FAILED / INTERRUPTED stale recovery.
- Discard late results after another terminal outcome.

## Explicit non-goals

- Real AvalAI adapter behavior, retry/read UI, Draft editing, Content acceptance, cancellation, polling, jobs, `after()`, or `waitUntil()`.
- Automatic retry, regeneration, deduplication, or rechecking current Idea/DNA after accepted operation creation.

## Source-of-truth references

- Phase 4 §§9, 12–25, 27–28, 31, and Attempt/lifecycle/atomic-artifact acceptance criteria.
- Architecture §§20–25, 29A–35, 71, 77–78, 87, 89–91, and 103.
- ADR-003, ADR-004, ADR-005, ADR-009, ADR-011, ADR-015, and ADR-016.
- Existing Phase 3 start/complete/fail/recover conditional repository patterns.

## Required behavior

- Exactly one AI Run is used for an Attempt and exactly one provider invocation follows the committed RUNNING transition.
- Later Idea decisions or current-DNA changes do not affect an accepted operation.
- Initial AI snapshot, Version #1 document, and Draft document are deeply equal canonical schema-v1 values.
- Content stores immutable source Idea/language/format/source Attempt and result lookup is a reverse query.
- Version #1 is numbered 1, source AI_GENERATED, creator-attributed, AI-Run-linked, and immutable.
- Invalid/oversized provider output maps to INVALID_OUTPUT, consumes invoked quota, and creates no artifacts.
- Failure categories remain safe; provider rate limit returns application source PROVIDER while persisting durable RATE_LIMITED.
- Stale RUNNING retains invoked quota and recovers to paired FAILED / INTERRUPTED without another provider call. Stale PENDING recovery and uninvoked release remain Ticket 05 responsibilities.
- Provider, validation, and domain failures transition durably to paired FAILED when their failure transaction succeeds.
- If the final success/failure persistence transaction itself fails, no Content/Draft/Version or partial terminal outcome commits. The service reports the persistence failure without representing FAILED as durable; the operation may remain RUNNING until stale recovery.
- Completion/recovery/failure races have exactly one terminal winner; late output cannot mutate terminal state.

## Persistence constraints

- Provider work never occurs inside a database transaction.
- Starting, success, failure, and recovery each use short conditional transactions.
- Successful Content/Draft/Version #1/terminal outcome persistence is all-or-nothing.
- Failure of final persistence must roll back the whole transaction. No caller result or log may claim FAILED unless a terminal transition actually commits; the operation may remain RUNNING until ordinary stale recovery records FAILED / INTERRUPTED.
- FAILED/PENDING/RUNNING Attempts have no reverse-linked Content; COMPLETED has exactly one.
- Only write-once terminal AI outcome fields are set on success; no raw material is persisted.

## Security and authorization requirements

- Only an already-authorized accepted operation can be started/recovered.
- Repositories reassert same-workspace relationships; application code does not trust stored/client IDs blindly.
- Provider-bound creator data is passed only through the neutral seam and safe structured logging is allowlisted.

## EN/FA and RTL/LTR requirements

- Accepted requested language is forwarded unchanged and remains immutable on Content.
- Unicode/mixed-direction text is preserved; this service performs no UI-direction transformation.

## Acceptance criteria

- [ ] Fake-backed success produces exactly one Attempt, AI Run, Content, Draft, and Version #1 with complete immutable lineage.
- [ ] AI snapshot, Version #1, and initial Draft are deeply equal.
- [ ] Provider is called once, outside a transaction, only after durable RUNNING/invoked state.
- [ ] No second current-DNA or Idea-status gate runs after acceptance.
- [ ] Every provider, validation, or domain failure produces paired durable FAILED state and no Content artifacts when its failure persistence succeeds.
- [ ] Injected final-database-transaction failure commits no partial Content, Draft, Version, AI output, or terminal state and does not report FAILED as durably recorded.
- [ ] After such persistence failure, a remaining RUNNING operation can later recover atomically to FAILED / INTERRUPTED through stale RUNNING recovery.
- [ ] Invalid/oversized output consumes invoked quota and never truncates.
- [ ] RUNNING 105-second recovery, invoked-quota retention, and no-provider behavior are proven; shared lifecycle primitives remain compatible with Ticket 05’s PENDING recovery.
- [ ] Concurrent completion/recovery/failure races produce one terminal winner and no orphan/duplicate artifacts.
- [ ] Navigation/caller loss introduces no cancellation request, CANCELLED state, or provider-abort semantics.
- [ ] Logs/persistence contain no raw prompt, provider envelope/output copy, refusal, hidden reasoning, or error body.

## Required tests

- **Unit:** orchestration result mapping and safe logging fields.
- **Integration:** fake-backed success and provider/validation/domain failures; durable failure when persistence succeeds; injected final-persistence failure with full rollback and no false FAILED result; subsequent stale RUNNING recovery; post-acceptance Idea/DNA changes; completion/recovery races; reverse result lookup; invoked-quota retention; immutable initial artifacts.
- **Component:** not required.
- **E2E:** deferred until user-facing routes exist.

## Dependencies and blockers

- Blocked by Tickets 03 and 05.
- Does not need Ticket 04 because orchestration must be deterministic against the neutral fake.
- Blocks Ticket 07 and Ticket 09.

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

## Answer

Implemented Ticket 06 only.

### Implemented

- Added provider-neutral Content Script execution to the Content application
  service through `generateContentScript`.
- Added a conditional PENDING → RUNNING transaction that locks the workspace
  and paired rows, sets one shared start timestamp, and marks the reservation
  invoked before the provider call.
- Added immutable accepted-input loading by the stored Idea and DNA-version
  identifiers without rechecking Idea status, current DNA pointer, or DNA
  readiness after acceptance.
- Added one-shot neutral-provider invocation with defensive result parsing and
  safe provider/validation failure mapping.
- Added an all-or-nothing success transaction creating exactly one Content,
  Draft revision 1, immutable AI-generated Version 1, canonical AI Run output,
  usage/correlation, and paired COMPLETED state.
- Added paired provider failure persistence, safe persistence-failure handling,
  RUNNING stale recovery at 105 seconds, invoked-quota retention, and late
  result/duplicate terminal-winner handling.

### Tests

Added deterministic fake-backed integration coverage for successful lineage,
start ordering, all neutral failure categories, oversized output, accepted
Idea/DNA stability, concurrent callers, stale RUNNING recovery, completion /
recovery races, duplicate completion, late failure, and final-persistence
rollback followed by stale recovery.

### Verification

- `npm run db:up` — passed.
- `npm run db:check` — passed.
- `npm run db:migrate:test` — passed.
- `npm run format:check` — passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run test` — passed: 27 unit files / 228 tests and 9 integration files /
  123 tests.
- `npm run build` — passed.
- `git diff --check` — passed.

### Scope / deviations

No UI, routes, actions, jobs, retry, draft editing, content reads/list, polling,
cancellation, or Phase 5 behavior was implemented. No database migration was
needed; Ticket 02 persistence is used unchanged. The external two-axis review
workers did not return within bounded waits, so that review was inconclusive;
the repository checks and full test/build verification passed.
