# 02: Deliver Content DNA read/save application services and versioning

**Status:** ready-for-agent
**Phase:** 02
**Blocked by:** 01: Establish Content DNA persistence and snapshot contracts

## Purpose

Provide the server-side Content DNA boundary that authorized callers can use to retrieve the current DNA, inspect immutable history, and explicitly save a new version without stale overwrites or inconsistent sequencing.

## Scope

- Add Content DNA application/query services for current DNA, version history, and individual immutable version retrieval.
- Add the explicit save operation with workspace authorization, normalized validation, optimistic concurrency, transaction handling, and current-version updates.
- Implement safe first-save and concurrent-update serialization using the approved database-backed strategy.
- Add deterministic PostgreSQL-backed integration tests for reads, authorization, save semantics, and concurrency.

## Dependencies

Requires Ticket 01's persistence model and canonical payload contracts. This ticket becomes the only Content DNA boundary consumed by the editor and history UI tickets.

## Architecture and source-of-truth references

- `AGENTS.md` §§9–13, 16, 34, 39–43, 44, 48, 54–57
- `docs/PRD.md` §§7–11, 54, 56, 58–59
- `docs/ARCHITECTURE.md` §§6, 8, 13, 17–18, 76–82, 84–90
- `docs/adr/ADR-001-modular-monolith.md`
- `docs/adr/ADR-002-authentication-and-workspaces.md`
- `docs/adr/ADR-003-versioning-strategy.md`
- `docs/adr/ADR-013-content-dna-version-storage.md`
- `docs/phases/phase-02-content-dna.md` §§5–6, 8–11, 14, 16–17

## Implementation requirements

- Keep React/UI code out of this ticket and keep database access inside the DNA module's server/application boundary.
- Resolve authenticated user and workspace membership server-side; never trust browser-provided IDs as authorization proof.
- Permit authenticated workspace members to read current DNA, history, and a version only within their workspace boundary.
- Require workspace-owner authorization for mutations without adding a generalized RBAC system.
- Expose DTOs sufficient for both the editor and history UI, without leaking Drizzle queries into either UI ticket.
- Accept `baseVersionId: UUID | null` for every explicit save.
- Normalize and storage-validate before equality comparison and persistence, then derive readiness from the canonical server-side rule.
- Return the existing current version without creating a new version when the normalized payload is identical.
- Return `CONFLICT` and create no version when the base version is stale. Do not overwrite, auto-merge, or create a stale successor version.
- In one short transaction, serialize the workspace's Content DNA mutation, obtain/create the container, re-read/lock the current state, assign the next version number, insert the immutable version, and atomically update the current reference.
- Handle the no-row first-save race with database-backed workspace-scoped serialization or an equivalent safe strategy; retain the database uniqueness constraint as an integrity backstop.
- Use stable, localizable application errors and structured logs containing only safe operational context, never Content DNA payload values.

## Explicit non-goals

- No React components, routes, editor state, history screens, or locale message additions.
- No autosave, persisted draft, collaboration, merge, restore, fork, delete, or diff behavior.
- No AI/ideas/content/publishing/social/analytics/jobs/assets/team functionality.


## Concurrency expectations:

- Two concurrent first saves with `baseVersionId: null`:
  exactly one may establish version 1; after serialization, the other observes
  a changed current version and returns `CONFLICT`.

- Two concurrent updates based on the same current version N:
  exactly one may create version N + 1; the other returns `CONFLICT`.

- A stale request must never become N + 2 merely because it waited for the
  winning transaction.

- Sequential saves that explicitly use the latest returned base version may
  naturally create N + 1, N + 2, and so on.

## Acceptance criteria

- [ ] Authorized callers can retrieve the current Content DNA, all saved versions, and a single immutable version through module application services.
- [ ] Unauthorized and cross-workspace reads/mutations are rejected without disclosing private Content DNA data.
- [ ] The first successful save atomically creates the container, version 1, and the committed current-version reference.
- [ ] Partial storage-valid payloads persist and report derived readiness correctly.
- [ ] Identical normalized saves return the existing current version and create no new row.
- [ ] A changed save creates exactly version `N + 1` and atomically makes it current.
- [ ] A stale `baseVersionId` returns `CONFLICT` and creates no new version.
- [ ] Concurrent first saves and concurrent valid updates preserve one container, sequential version numbers, immutable history, and the correct current pointer.
- [ ] No React component queries Drizzle or contains Content DNA persistence/authorization rules.

## Tests

- PostgreSQL-backed integration tests for first creation, partial persistence, current/history/version reads, owner mutation, cross-workspace denial, identical save, changed save, stale conflict, and immutable historical versions.
- Dedicated concurrency tests for two first saves and concurrent updates against the same version.
- Unit tests for stable error mapping or DTO/readiness presentation logic where deterministic and useful.
- Maintain existing dedicated test-database safeguards.

## Verification commands

- `npm run db:migrate:test`
- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `git diff --check`
- `npm run build`

## Review requirements

- Review transaction boundaries, advisory-lock or equivalent serialization behavior, and every authorization path.
- Verify no external API, browser identity, payload logging, or future-phase dependency enters the module.
- Confirm editor/history consumers can depend on service DTOs rather than persistence internals.

## Completion report requirements

- Describe the public server/application operations added and their authorization behavior.
- Report the save/concurrency strategy and integration-test evidence.
- State whether any database-invariant tradeoff from Ticket 01 affected the service design.
- Confirm no UI or Phase 3+ implementation was added.

