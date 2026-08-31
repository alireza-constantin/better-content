# 01: Establish Content DNA persistence and snapshot contracts

**Status:** ready-for-agent
**Phase:** 02
**Blocked by:** None (can start immediately)

## Purpose

Establish the reviewed, migration-backed Content DNA persistence model and the canonical V1 snapshot contract so later application services can safely create and interpret immutable versions.

## Scope

- Add the `content_dna` workspace-owned container and immutable `content_dna_versions` persistence model.
- Create the reviewed Drizzle migration and the required relational keys, foreign keys, uniqueness constraints, and integrity protections.
- Establish the V1 JSONB payload contract with `schemaVersion: 1` inside the payload only.
- Implement canonical normalization, storage validation, unknown-key rejection, and the one canonical server-side readiness rule.
- Add focused unit and PostgreSQL-backed integration coverage for the contracts and persistence invariants.

## Dependencies

None. This ticket establishes the domain/persistence contract consumed by subsequent Phase 2 work.

## Architecture and source-of-truth references

- `AGENTS.md` §§7, 11–12, 15–16, 20, 34, 39–40, 44, 54–57
- `docs/PRD.md` §§4, 8–11, 54, 56, 58–59
- `docs/ARCHITECTURE.md` §§13–19, 76–82, 103
- `docs/adr/ADR-002-authentication-and-workspaces.md`
- `docs/adr/ADR-003-versioning-strategy.md`
- `docs/adr/ADR-012-drizzle-migrations.md`
- `docs/adr/ADR-013-content-dna-version-storage.md`
- `docs/phases/phase-02-content-dna.md` §§5–9, 15–17

## Implementation requirements

- Use the canonical `content_dna` name. Do not create a `content_dna_profile` or a second Content DNA aggregate.
- Ensure only one Content DNA container can exist per workspace.
- Store version bodies as self-contained JSONB snapshots and do not add a relational `schema_version` column.
- Reserve relational columns for stable identity, workspace ownership, lineage, sequential version number, current-version reference, author, and timestamps.
- Ensure a committed Content DNA container always has a current version. The first successful save will create the container, version 1, and its current reference atomically in Ticket 02.
- Enforce `(content_dna_id, version_number)` uniqueness and protect the same-container current-version invariant as far as PostgreSQL/Drizzle can practically enforce it.
- Version payloads must never be updated in place.
- Phase 2 must expose no individual historical-version deletion operation.
- Do not introduce a deletion-blocking mechanism that would silently determine
  future workspace/account deletion or retention policy.
- If database-level immutability enforcement has a material tradeoff, report
  it rather than inventing lifecycle policy.
- Implement V1 payload normalization before validation, equality comparison, and persistence: canonical absent empty values, normalized newlines, preserved mixed-language prose, ordered case-insensitively unique creator lists, and valid `en`/`fa` content-language rules.
- Reject unknown payload keys. Do not silently repair inconsistent language values.
- Keep storage validity distinct from AI readiness. Do not introduce a persisted readiness or lifecycle status enum.

## Explicit non-goals

- No Content DNA application service, transaction orchestration, authorization flow, or save endpoint/action.
- No React components, editor, history UI, or locale messages.
- No ideas, AI calls, prompts, `ai_runs`, content, publishing, social, analytics, jobs, assets, teams, autosave, drafts, restore/fork/delete, or extra content languages.

## Acceptance criteria

- [ ] A reviewed Drizzle migration creates only the approved Content DNA tables and necessary relational constraints/indexes.
- [ ] One workspace cannot have more than one `content_dna` container.
- [ ] The migration/database design enforces the same-container current-version invariant as far as practical; any implementation tradeoff is explicitly reported.
- [ ] Version bodies are immutable JSONB snapshots with `schemaVersion` only inside the payload.
- [ ] V1 storage validation enforces types, limits, optionality, language rules, canonical empty-value absence, and unknown-key rejection.
- [ ] The canonical readiness function correctly distinguishes `INCOMPLETE` and `AI_READY` without persisting status.
- [ ] Normalization preserves list order and first-entered casing while deduplicating creator-defined list entries case-insensitively.
- [ ] No Phase 3+ schema or implementation is introduced.

## Tests

- Unit tests for payload shape, normalization, canonical empty-value handling, unknown-key rejection, language constraints, ordered-list behavior, and readiness derivation.
- PostgreSQL-backed integration tests for migration health, one-container-per-workspace uniqueness, version-number uniqueness, immutable version behavior and absence of an individual Phase 2 deletion path, and current-version integrity.
- Maintain existing dedicated test-database safeguards.

## Verification commands

- `npm run db:generate`
- `npm run db:migrate:test`
- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## Review requirements

- Review the generated migration and all relational invariants, especially same-container current-version integrity and immutability.
- Confirm the payload remains Content-DNA-specific JSONB rather than a broad JSONB policy for other domains.
- Confirm no secrets or payload values are introduced into logs or test output.

## Completion report requirements

- List the schema/migration artifacts and constraints introduced.
- State the exact database approach used for same-container current-version integrity and version immutability, including any practical tradeoff.
- Report unit/integration test results and verification-command results.
- Confirm no application UI, AI, ideas, or other future-phase work was added.
