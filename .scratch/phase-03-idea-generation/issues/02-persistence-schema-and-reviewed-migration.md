# 02: Add Phase 3 persistence schema and reviewed migration

**What to build:** A migration-backed PostgreSQL foundation that can safely represent one traceable, workspace-owned generation batch, its one AI run, exactly 20 immutable generated ideas, and concurrency-safe quota reservations.

**Blocked by:** 01: Define Idea Generation domain contracts and canonical validation.

**Status:** ready-for-agent

## Goal

Implement the approved relational model and database-enforced invariants without beginning generation orchestration.

## Scope

- Add Drizzle schema and one reviewed migration for only `ai_runs`, `idea_generation_batches`, `ideas`, and `workspace_generation_quota_reservations`.
- Encode the Phase 3 foreign keys, candidate/composite key, uniqueness, checks, timestamps, safe JSONB columns, and minimal history/ideas-by-batch indexes.
- Add migration/constraint integration coverage against the dedicated test database.

## Relevant source-of-truth references

- `AGENTS.md` §§11–12, 15–18, 31–32, 40, 47, 54–56.
- `docs/PRD.md` §§11–16.
- `docs/ARCHITECTURE.md` §§13–19, 24–29, 77–81, 95–96.
- `docs/adr/ADR-011-ai-provider-boundary.md`.
- `docs/adr/ADR-013-content-dna-version-storage.md`.
- `docs/adr/ADR-014-initial-ai-provider-and-model-for-idea-generation.md`.
- `docs/phases/phase-03-idea-generation.md` §§2–4, 8–10, 13–15.

## Architecture constraints

- PostgreSQL and Drizzle are the persistence boundary; use UUIDs, timestamptz, checked strings, foreign keys, unique/check constraints, and reviewed migration workflow—never `drizzle push`.
- `ai_runs` stays provider-neutral. Batch owns source/request facts; run owns provider/model/prompt/settings/execution/output/usage facts.
- Ideas have no `workspace_id`; ownership is exclusively `Idea → Batch → Workspace`.
- Preserve historical migrations; do not add tables/columns for future providers, jobs, content, publishing, analytics, assets, teams, or decision events.

## Expected behavior

- A batch cannot reference a run from another workspace: expose `ai_runs(workspace_id, id)` as a candidate key and enforce the batch composite foreign key to it.
- A run can back one Phase 3 batch only, and a batch has one run only.
- Database constraints allow only fixed count 20, positions 1–20, valid lifecycle/status/error strings, unique `(batch_id, position)`, unique `(workspace_id, idempotency_key)`, and unique batch `ai_run_id`.
- Schema supports short-lived, PostgreSQL-only quota reservations with the data necessary to distinguish uninvoked from invoked reservations; it does not create a generalized rate-limit product.

## Persistence requirements

- `ai_runs`: workspace FK; `IDEA_GENERATION`, `openai`, `gpt-5.6-terra`, `idea-generation/v1`; safe validated settings; lifecycle/timestamps; nullable canonical snapshot and neutral usage only as allowed by Phase 3.
- `idea_generation_batches`: workspace and DNA-version FKs, unique `ai_run_id`, composite same-workspace FK, opaque UUID idempotency key, server fingerprint, constrained request language/count, and paired lifecycle/outcome timestamps.
- `ideas`: batch FK, immutable generated fields, application-derived language, mutable decision/timestamp/reason fields only, no idea workspace column.
- Retain only provider-neutral numeric usage JSONB semantics; no raw prompt/envelope/response ID/refusal/reasoning/raw usage/estimated cost.

## Authorization requirements

- Persistence must make the batch the workspace ownership boundary and preserve FKs needed for service-layer membership/owner checks; it does not expose database access to a client.

## EN/FA + RTL/LTR requirements

- Store requested and derived idea language as checked `en`/`fa` data independent of locale. No UI or localized strings are introduced.

## Security/privacy requirements

- Enforce relationships/invariants in PostgreSQL to prevent cross-workspace pairing and invalid state/count data.
- Do not persist raw prompts, provider envelopes/IDs, refusal text, hidden reasoning, SDK objects, secrets, or estimated cost.

## Acceptance criteria

- [ ] The migration applies cleanly to an empty dedicated test database and is committed with schema changes.
- [ ] Every Section 3 relational/check/unique invariant is DB-enforced, including same-workspace batch/run pairing, one run per batch, positions, counts, and idempotency.
- [ ] Ideas have no `workspace_id`, while a batch and run both retain their deliberate workspace ownership columns.
- [ ] `output_snapshot`, settings, and usage admit only the approved safe data design; no deferred schema appears.
- [ ] Minimal `(workspace_id, created_at DESC)` history and ideas-by-batch access paths are present without speculative indexes.

## Focused tests

- PostgreSQL integration tests for FKs, composite cross-workspace rejection, one-to-one batch/run, count/position/status checks, idempotency uniqueness, missing idea workspace column, and migration application.

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

- Generation service, provider invocation, OpenAI SDK/configuration, UI, content/DNA schema changes, historical DNA generation, count/language expansion, decision history/bulk actions, jobs, provider routing/fallbacks, content, publishing, analytics, and social integrations.

## Dependencies

- 01: Define Idea Generation domain contracts and canonical validation.
