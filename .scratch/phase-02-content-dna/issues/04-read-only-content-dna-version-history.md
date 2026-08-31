# 04: Deliver read-only Content DNA version history

**Status:** ready-for-agent
**Phase:** 02
**Blocked by:** 02: Deliver Content DNA read/save application services and versioning

## Purpose

Let an authorized user independently inspect every saved immutable Content DNA version and its derived readiness without depending on the editor implementation.

## Scope

- Add localized read-only history and immutable version-detail experiences using Ticket 02's read services.
- Show all successfully persisted versions, including incomplete versions, with a current marker and readiness derived from each historical payload.
- Enforce read-only behavior and ownership boundaries in the UI/service integration.
- Add focused UI/component tests for history and detail rendering in English/Persian and LTR/RTL.

## Dependencies

Requires Ticket 02 only. It is intentionally independent of Ticket 03: history consumes the same read application services, not editor components or editor state.

## Architecture and source-of-truth references

- `AGENTS.md` §§10, 13, 15–16, 36–39, 42, 44, 50–51
- `docs/PRD.md` §§4, 9–11, 54, 56, 58–59
- `docs/ARCHITECTURE.md` §§13, 17–19, 72–76, 103
- `docs/adr/ADR-002-authentication-and-workspaces.md`
- `docs/adr/ADR-003-versioning-strategy.md`
- `docs/adr/ADR-010-internationalization.md`
- `docs/adr/ADR-013-content-dna-version-storage.md`
- `docs/phases/phase-02-content-dna.md` §§5–6, 8, 11–13, 16–17

## Implementation requirements

- Consume Ticket 02's current/history/version read DTOs and authorization boundary; do not query Drizzle from React components.
- Include every successfully saved version, whether incomplete or AI-ready.
- Mark the current version accurately and derive readiness from each version's immutable payload, not from current DNA state.
- Provide a read-only version-detail view that presents stored content-language preferences independently from the active UI locale.
- Do not expose controls or mutation paths for editing historical versions, restore, fork, delete, or diff.
- Localize labels and states for English/Persian, use logical-direction styling, preserve mixed-direction prose, and provide semantic accessible navigation and detail structure.

## Explicit non-goals

- No editor implementation or dependency on Ticket 03.
- No direct persistence access, save behavior, version restore/fork/delete/diff, autosave, drafts, or collaboration.
- No AI/ideas/content/publishing/social/analytics/jobs/assets/team functionality.

## Acceptance criteria

- [ ] An authorized user can view all saved versions and a selected immutable version through the application-service boundary.
- [ ] The history distinguishes the current version and renders `INCOMPLETE` or `AI_READY` based on each version's own payload.
- [ ] Version detail is read-only and does not expose edit, restore, fork, delete, or diff behavior.
- [ ] Unauthorized/cross-workspace history access is denied by the service boundary and does not reveal private history.
- [ ] English and Persian history/detail UI works in LTR and RTL and leaves creator content language unchanged.
- [ ] No React component queries Drizzle or reimplements version/readiness rules.

## Tests

- Focused UI/component tests for all-version rendering, current marker, per-version readiness, read-only detail, absent/incomplete data, and unavailable actions.
- EN/FA and LTR/RTL rendering tests, including mixed-language Content DNA display.
- Keep history authorization/integrity integration tests in Ticket 02; verify this ticket only consumes that boundary.

## Verification commands

- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## Review requirements

- Use `web-design-guidelines` for read-only navigation, semantic structure, accessibility, responsive behavior, and RTL/LTR review.
- Confirm no editor dependency or mutation capability was introduced.

## Completion report requirements

- Summarize history and detail states delivered and the read-service DTOs consumed.
- Report localization/accessibility/UI test results.
- Confirm no editor, restore, fork, delete, diff, or later-phase behavior was added.
