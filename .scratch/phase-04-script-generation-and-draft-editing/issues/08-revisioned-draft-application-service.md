# 08 — Add the authoritative revisioned Draft service

**What to build:** Implement owner-authorized Draft reads and saves that validate canonical human schema-v1 documents, conditionally advance a positive revision, reject stale writes without data loss, and leave Content Version #1 and AI Run output untouched.

**Blocked by:** 02 — Establish Content-generation persistence and database invariants.

**Status:** ready-for-agent

## Goal

Make optimistic concurrency a server-enforced domain rule before browser autosave is introduced.

## Scope

- Add Content Draft read and save application services/repositories and minimal browser action result DTOs.
- Validate Content/workspace ownership and V1 owner mutation authority.
- Canonicalize human Draft input using Ticket 01 rules.
- Require `baseRevision`; update document, increment revision, and set Draft `updatedAt` only on an exact match.
- Return authoritative revision/document metadata needed by the editor.
- Return stable CONFLICT without overwriting current data.
- Preserve empty text and all intentional non-line-ending whitespace.

## Explicit non-goals

- Client debounce/queue/status UI, automatic merge, collaboration, offline storage/queue, manual Content creation, new Versions, acceptance, or AI editing.
- Touching Content on save or exposing Version-history/diff/restore UI.

## Source-of-truth references

- Phase 4 §§16, 18, 20, 26–27, 31, and Script/Draft acceptance criteria.
- PRD §§20, 25, 27, 54, 56, and 58.
- Architecture §§30–36, 76–82, and 84–90.
- ADR-002, ADR-003, ADR-004, ADR-010, ADR-012, and ADR-016.
- Phase 2 current-version conflict and stale-save testing patterns where applicable.

## Required behavior

- Reads require workspace membership; saves require current V1 owner authority.
- Save input is exact Content ID, workspace ID, base revision, and schema-v1 document.
- LF normalization occurs server-side; empty text is valid; more than 50,000 characters or unknown keys is invalid.
- Successful conditional save advances revision exactly once and updates Draft `updatedAt`.
- Concurrent/stale base revision returns CONFLICT and cannot overwrite the winning document.
- Replaying a stale save remains a conflict; no implicit merge or last-write-wins behavior exists.
- Saves change only the Draft; they do not mutate Content, AI Run output, Version #1, or create a Version.

## Persistence constraints

- Use a single conditional update or equivalent transactionally safe repository operation.
- `Draft.updatedAt` is the authoritative last-edited value.
- Database-level Content/Version immutability must remain proven by integration tests during saves.

## Security and authorization requirements

- Resource ID is not proof of ownership; Content → workspace is verified server-side.
- Foreign Content/workspace combinations are nondisclosing.
- Script is treated as untrusted text and no HTML/Markdown execution contract is introduced.

## EN/FA and RTL/LTR requirements

- The service preserves English, Persian, and mixed-direction Unicode exactly except newline normalization.
- UI locale never changes stored Draft data or Content language.

## Acceptance criteria

- [ ] Valid exact-revision save increments revision and updates only Draft document/revision/updatedAt.
- [ ] Empty Script saves successfully; 50,000 succeeds; 50,001 and unknown-key documents fail validation.
- [ ] CRLF/CR normalize to LF and every other whitespace character is preserved.
- [ ] Stale/concurrent saves return CONFLICT and never overwrite the authoritative Draft.
- [ ] Version #1, AI Run output, Content identity, and Content timestamps remain unchanged after any save.
- [ ] Membership/owner rules and nondisclosing cross-workspace behavior are integration-tested.
- [ ] No merge, collaboration, offline, acceptance, or Version-creation behavior is added.

## Required tests

- **Unit:** human canonicalization integration, action result mapping.
- **Integration:** revision success/conflict race, authorization/isolation, empty/boundary/Unicode persistence, unchanged immutable artifacts and Content list ordering value.
- **Component:** not required.
- **E2E:** browser serialization/conflict recovery is covered in Ticket 10.

## Dependencies and blockers

- Blocked by Ticket 02 and uses Ticket 01 contracts.
- Can run in parallel with Tickets 05–07 after persistence lands.
- Blocks Ticket 10.

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
