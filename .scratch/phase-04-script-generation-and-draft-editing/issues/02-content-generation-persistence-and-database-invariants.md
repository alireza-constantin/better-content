# 02 — Establish Content-generation persistence and database invariants

**What to build:** Add the reviewed Drizzle schema and migration that can durably represent Content Generation Attempts, Content, one mutable Draft, immutable Version #1, Content quota reservations, and the compatible Phase 4 AI Run expansion with all approved ownership and immutability guarantees.

**Blocked by:** 01 — Define Content Script domain contracts and canonical validation.

**Status:** resolved

## Goal

Create the database foundation that makes invalid Phase 4 lineage and mutation impossible before orchestration depends on it.

## Scope

- Add only the Phase 4 tables and AI Run expansion approved in Phase 4 §30.
- Model Attempt `1 → 0..1` Content from Content’s non-null unique `sourceGenerationAttemptId`.
- Add same-workspace candidate/composite foreign keys for Attempt/AI Run and Content/Attempt.
- Add one-Draft, unique Content-version number, source-AI-Run, idempotency, quota, lifecycle, and access-path constraints/indexes.
- Add database enforcement for immutable Content lineage, immutable Attempt request/lineage, and all Content Version fields.
- Preserve all historical Phase 3 rows and reviewed migrations.

## Explicit non-goals

- Repository/application services or provider calls.
- `resultingContentId` on Attempt or cyclic foreign keys.
- Content status, acceptance/publication pointers, schema-version columns, directions, blocks, jobs, assets, analytics, social data, or speculative indexes.
- Rewriting any historical migration.

## Source-of-truth references

- Phase 4 §§9, 14–15, 19–23, 30–31, and Acceptance criteria “Attempt, AI Run, and atomic artifacts.”
- Architecture §§14–16, 24–25, 29A–36, 77, 79–81, and 103.
- ADR-002, ADR-003, ADR-004, ADR-005, ADR-011, ADR-012, ADR-013, ADR-015, and ADR-016.
- Existing Phase 3 AI Run, batch, quota-reservation, composite-FK, check-constraint, and immutability-trigger patterns.

## Required behavior

- Attempt persists immutable workspace/source Idea/accepted DNA/request/idempotency/fingerprint/AI Run facts plus lifecycle/error/timestamps.
- Exactly one same-workspace AI Run is paired to each Attempt.
- Content persists immutable workspace/source Idea/language/format/source Attempt facts and `createdAt`; no lifecycle status is added.
- Content’s source Attempt is non-null and unique; reverse lookup derives the optional result.
- Content Draft has one row per Content, schema-v1 JSONB document, positive integer revision, `createdAt`, and `updatedAt`.
- Content Version has a unique positive sequence within Content, schema-v1 JSONB, source, AI Run link where applicable, creator user, and creation time.
- Content-generation quota reservations are distinct from Idea-generation reservations and support live, invoked, and released semantics.
- Existing AI Run checks/types expand compatibly for `CONTENT_SCRIPT_GENERATION`, its settings/output, and optional safe AvalAI correlation.

## Persistence constraints

- Database constraints reject cross-workspace Content → Attempt and Attempt → AI Run links.
- Database enforcement rejects updates to Content identity/lineage, Attempt request/lineage, and every Content Version column.
- Only domain-approved Attempt/AI Run lifecycle fields and Draft document/revision/updatedAt can mutate.
- Checks enforce valid lifecycle/error/timestamp/output combinations and terminal-state consistency that can be enforced per row.
- Index only Content list by Draft update, Idea-to-Content/Attempt history, Attempt history, workspace idempotency, quota windows, and required FK paths.

## Security and authorization requirements

- Workspace ownership is structurally encoded where possible; application authorization remains mandatory.
- Foreign keys must prevent a client-controlled ID from creating cross-workspace lineage.
- No sensitive prompts, provider envelopes/errors, or duplicated creator inputs are added to AI Run/Content tables.

## EN/FA and RTL/LTR requirements

- Database checks accept only `en | fa`; storage remains Unicode-safe and direction-neutral.
- UI locale is not persisted on Content or Attempt.

## Acceptance criteria

- [ ] A fresh test database migrates successfully and existing Phase 3 data remains valid.
- [ ] Attempt has no result-content column; Content has non-null unique `sourceGenerationAttemptId`.
- [ ] Composite constraints enforce same-workspace Attempt/AI Run and Content/Attempt lineage without a cycle.
- [ ] Constraints enforce one Draft per Content, unique positive Version number, and at most one generated Version per source AI Run.
- [ ] Database tests reject mutation of every protected Content, Attempt, and Content Version field.
- [ ] Lifecycle/check tests reject invalid status, error, timestamp, output, language, format, source, fingerprint, and revision combinations.
- [ ] Content-generation quota storage is separate from Phase 3 Idea quota storage.
- [ ] No deferred Phase 5 or lifecycle/publication columns are present.

## Required tests

- **Unit:** schema/type compilation where useful.
- **Integration:** clean migration; backward compatibility; all FK/check/unique/index/immutability invariants; concurrent uniqueness races.
- **Component:** not required.
- **E2E:** not required; later tickets exercise the migrated schema through user flows.

## Dependencies and blockers

- Blocked by Ticket 01.
- Blocks Tickets 05 and 08.

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

## Answer

Implemented Ticket 02 only. Added the reviewed Phase 4 Drizzle persistence
model and migration `0006_salty_xavin`: `content_generation_attempts`,
`contents`, `content_drafts`, `content_versions`, and a separate
`workspace_content_generation_quota_reservations` relation.

The migration uses the approved acyclic composite same-workspace foreign keys
for Attempt → AI Run and Content → Attempt; Content owns the non-null unique
`source_generation_attempt_id`, so Attempt results remain a reverse lookup.
It also adds the approved lifecycle, language, format, fingerprint, document
revision, version, quota, and access-path constraints, plus PostgreSQL triggers
for immutable Attempt request/lineage fields, immutable Content rows, immutable
Content Version rows, and Phase 4 Content Script AI Run configuration/outcomes.

Extended `ai_runs` compatibly for `CONTENT_SCRIPT_GENERATION`, retaining valid
historical Phase 3 provider/model rows and adding only the safe request
correlation field and Content Script policy checks. No provider calls,
repositories, application services, pages, UI, jobs, or later Ticket work was
introduced.

Added focused PostgreSQL integration coverage for the migration catalog,
cross-workspace FKs, one-Draft/one-result/version invariants, lifecycle and
quota checks, immutable fields, Content Script AI Run policy, and concurrent
workspace-scoped idempotency. The dedicated test database was recreated and
migrated from clean state; all required checks, including the complete test
suite, passed.
