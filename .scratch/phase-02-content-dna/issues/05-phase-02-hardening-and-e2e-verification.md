# 05: Harden and verify the complete Content DNA workflow

**Status:** ready-for-agent
**Phase:** 02
**Blocked by:** 03: Build the localized Content DNA editor; 04: Deliver read-only Content DNA version history

## Purpose

Provide phase-wide confidence that the completed Content DNA workflow is secure, private, accessible, responsive, concurrency-safe, localized, and demonstrably correct from creation through version history.

## Scope

- Add focused Playwright coverage for create → save → edit → history using the completed feature.
- Perform cross-cutting authorization/isolation, privacy/logging, accessibility, responsive, EN/FA, and LTR/RTL verification.
- Re-verify migration behavior and the existing database-test safeguards.
- Close only defects that are within approved Phase 2 scope; do not use this ticket to build functionality omitted by Tickets 01–04.

## Dependencies

Requires both Ticket 03 and Ticket 04. It verifies the complete feature path after both independently implemented UI consumers are available.

## Architecture and source-of-truth references

- `AGENTS.md` §§13, 36–39, 42–50, 54–57
- `docs/PRD.md` §§4, 7–11, 54, 56, 58–60
- `docs/ARCHITECTURE.md` §§13, 17–19, 72–76, 79–82, 84–90, 92–96
- `docs/adr/ADR-002-authentication-and-workspaces.md`
- `docs/adr/ADR-003-versioning-strategy.md`
- `docs/adr/ADR-010-internationalization.md`
- `docs/adr/ADR-012-drizzle-migrations.md`
- `docs/adr/ADR-013-content-dna-version-storage.md`
- `docs/phases/phase-02-content-dna.md` §§10–17

## Implementation requirements

- Verify the focused E2E journey: authorized user creates a Content DNA, explicitly saves it, changes it against the current base version, and inspects both immutable versions in history.
- Verify stale-save conflict handling preserves local edits and does not create an extra version.
- Re-run and extend focused first-save/update concurrency evidence only where needed to prove the completed end-to-end feature still preserves Ticket 02's guarantees.
- Review logs, telemetry paths, errors, and test output to ensure Content DNA payload values are not emitted.
- Review workspace isolation, server-side authorization, localizable errors, privacy notice, keyboard interaction, focus behavior, responsive layout, EN/FA messages, locale-preserving sessions, and RTL/LTR layout.
- Confirm database migration/test setup remains isolated from production data and migrations apply cleanly.
- Treat missing foundational behavior as a defect in its originating ticket; do not silently add a new product feature in this hardening ticket.

## Explicit non-goals

- No new Content DNA capability beyond Phase 2 acceptance criteria.
- No replacement for ticket-level unit, integration, or UI tests from Tickets 01–04.
- No AI, ideas, content, publishing, social, analytics, jobs, assets, teams, autosave, drafts, collaboration, restore/fork/delete/diff, taxonomies, PII detection, moderation, or additional content languages.

## Acceptance criteria

- [ ] Playwright proves the authorized create → save → edit → history workflow with immutable version history.
- [ ] End-to-end stale-save behavior returns localized conflict feedback, keeps browser-local edits, and creates no unintended version.
- [ ] Cross-workspace authorization/isolation, payload-safe logging, privacy notice, and localizable stable errors are reviewed and verified.
- [ ] Editor and history accessibility, keyboard use, focus states, responsive behavior, EN/FA rendering, LTR/RTL layout, and session-preserving locale switching are verified.
- [ ] Migration verification, database-test safeguards, unit tests, PostgreSQL integration tests, and concurrency tests remain passing.
- [ ] No Phase 2 acceptance criterion remains orphaned, and no Phase 3+ scope is introduced.

## Tests

- Focused Playwright create → save → edit → history coverage, including EN/FA and key LTR/RTL assertions.
- End-to-end or integration evidence for stale conflict, authorization isolation, and no unintended version creation.
- Re-run all relevant Ticket 01–04 unit, integration, UI, migration, and concurrency suites.

## Verification commands

- `npm run db:migrate:test`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`
- `git diff --check`
- `git status`

## Review requirements

- Use `web-design-guidelines` for the final UI accessibility, responsive, focus, and RTL/LTR review.
- Use `security-best-practices` for the TypeScript security/privacy review of authorization, sensitive logging, and server/client boundaries.
- Review the Phase 2 specification and every completed ticket against the final implementation; report, rather than conceal, any remaining acceptance gap.

## Completion report requirements

- Report E2E, unit, integration, migration, and quality-command results.
- Summarize authorization, privacy/logging, accessibility, responsive, and localization verification.
- Map any corrected defect to its originating Phase 2 concern.
- Confirm no implementation was added outside approved Phase 2 scope and identify any remaining risk for architect review.
