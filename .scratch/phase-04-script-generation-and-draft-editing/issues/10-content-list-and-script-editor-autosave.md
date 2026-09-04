# 10 — Deliver the Content list and Script editor with serialized autosave

**What to build:** Add localized `/content` and `/content/{id}` surfaces that load authorized DTOs, display the minimal approved metadata, edit plain Script text, serialize debounced saves against authoritative revisions, and provide accessible save-failure and conflict recovery without losing local text.

**Blocked by:** 07 — Deliver authorized Content reads, Attempt history, and retry; 08 — Add the authoritative revisioned Draft service.

**Status:** resolved

## Goal

Give creators a complete minimal Draft workspace while keeping all persistence, concurrency, language, and lineage rules server-authoritative.

## Scope

- Add localized Content list sorted by Draft `updatedAt` descending with approved metadata and loading/empty/error states.
- Add localized editor with source context, plain-text Script surface, current revision, and save status.
- Implement approximately 750–1000 ms debounce and exactly one save in flight.
- Coalesce intermediate edits to the latest local document and immediately send it after a prior save succeeds when still different.
- Handle successful revision advancement, save failure with explicit Retry/Save, and conflict with Reload plus Copy unsaved text.
- Stop the autosave queue on conflict while retaining the complete local Script.
- Set editor `lang`/`dir` from immutable Content language, independent of UI locale.
- Optionally state that the original AI output is retained, without exposing history/diff.

## Explicit non-goals

- Rich text, Markdown, blocks, directions, anchors, editor-library selection, history/diff/restore, manual checkpoint, per-keystroke Version, automatic merge, collaboration, offline persistence/queue, or AI editing.
- Title, search, filters, folders, bulk actions, archive/delete, acceptance, queue, publication, analytics, or fake metrics.
- Manual/import/duplicate Content creation.

## Source-of-truth references

- Phase 4 §§16, 18, 20, 26–27, 29, 31, and Script/Draft/UX/i18n acceptance criteria.
- PRD §§19–27 and 48.
- Architecture §§8, 13, 30–36, 72–75, 82, 84–96.
- ADR-002, ADR-003, ADR-004, ADR-010, and ADR-016.
- Frontend standards §§1–10 and existing Content DNA unsaved/focus patterns where applicable.

## Required implementation guidance

- Use Server Components for authorization and initial DTO loading; isolate the editor/autosave state in a cohesive client component/hook.
- Use existing shadcn/ui primitives and the exact relevant installed frontend/design skills during implementation and review.
- React imports application actions/DTOs only, never Drizzle, repositories, provider code, or database rows.

## Required behavior

- List ordering and displayed last-edited time use Draft `updatedAt`; autosave never touches Content.
- Script is plain Unicode text; HTML-like input displays literally and never executes.
- Typing moves status to Unsaved, debounce to Saving, success to Saved; failure and Conflict are distinct and announced.
- Only one request is active. If A at N is saving while B/C/D occurs, success N+1 causes only latest D to save at N+1.
- Conflict never overwrites the server or discards local text. Reload intentionally replaces local text; Copy copies the retained local text.
- Failed save preserves local text and explicit retry uses the same current local value and authoritative base revision rules.
- Empty human Draft is valid.
- No `beforeunload` promise of offline durability is added beyond truthful unsaved-state behavior.

## Persistence constraints

- All saves use Ticket 08 and provide `baseRevision`.
- No ordinary save creates a Content Version or mutates AI Run/Version #1/Content identity.
- List/detail refreshes do not infer workflow state from speculative Content status.

## Security and authorization requirements

- Pages authorize workspace membership before data loading; mutations require V1 owner.
- Foreign Content IDs are nondisclosing.
- Do not expose Attempt instructions in Content list/editor or inject creator text as HTML.
- Clipboard failure is handled safely without clearing local content.

## EN/FA and RTL/LTR requirements

- All UI strings are localized; layouts use logical direction and work in EN/LTR and FA/RTL.
- Editor base direction is `en/ltr` or `fa/rtl` from Content language, not route locale.
- Mixed English/Persian relies on native Unicode/browser bidi and is never reversed or transformed on locale change.

## Acceptance criteria

- [x] Content list contains only approved metadata, orders by Draft `updatedAt`, and has accessible loading/empty/error states.
- [x] Editor loads source context and exact Draft/revision through authorized DTOs.
- [x] Debounce falls within 750–1000 ms, only one save is in flight, and intermediate edits coalesce to the latest document.
- [x] Successful saves advance displayed revision/status; empty Script saves successfully.
- [x] Save failure retains local text and exposes an explicit Retry/Save control.
- [x] Conflict stops autosave, retains local text, announces the problem, and offers working Reload and Copy actions.
- [x] A stale tab never overwrites a newer Draft and no automatic merge occurs.
- [x] HTML-like and mixed-direction text render literally and retain their stored value.
- [x] Editor direction follows Content language across both UI locales.
- [x] No forbidden list/editor controls or Phase 5 schema/UI appear.

## Required tests

- **Unit:** serialized autosave state machine/hook with fake timers; latest-document coalescing; failure/conflict recovery.
- **Integration:** page/action authorization and saves through Ticket 08; ordering after edits; immutable artifacts unchanged.
- **Component:** every save state, empty and HTML-like text, conflict Reload/Copy, keyboard/focus/announcements, EN/FA/RTL and content-language independence.
- **E2E:** list order, real deterministic browser autosave, failure preservation, two-tab conflict, empty Draft, mixed bidi, mobile/desktop; final cross-cutting matrix in Ticket 11.

## Dependencies and blockers

- Blocked by Tickets 07 and 08.
- Blocks Ticket 11.

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
npm run test:e2e
git diff --check
```

## Implementation notes

- Added localized `/content` and `/content/{contentId}` Server Component routes using the Ticket 07 authorized DTO services, with a cohesive client editor and autosave hook around Ticket 08.
- Added the minimal Content list, source Idea context, plain-text Script textarea, accessible save states, failure recovery, conflict Reload/Copy recovery, and EN/FA Content-language direction handling.
- Added focused list, route, boundary, editor, and serialized-autosave tests plus deterministic PostgreSQL-backed Playwright coverage. No schema/migration change or provider call was added.
- Verification passed: `npm run db:up`, `npm run db:check`, `npm run db:migrate:test`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test` (34 unit files/260 tests and 10 integration files/147 tests), `npm run build`, `npm run test:e2e` (17 tests), and `git diff --check`.
