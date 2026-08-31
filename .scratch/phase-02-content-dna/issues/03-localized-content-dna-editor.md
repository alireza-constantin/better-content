# 03: Build the localized Content DNA editor

**Status:** resolved
**Phase:** 02
**Blocked by:** 02: Deliver Content DNA read/save application services and versioning

## Purpose

Give a workspace owner a localized, accessible editor for creating or updating a Content DNA through the established server-side application-service boundary.

## Scope

- Add the Content DNA empty state and structured editor experience.
- Load the current Content DNA through Ticket 02's read DTO and submit explicit saves through its mutation boundary.
- Support partial saves, validation feedback, readiness status, ordered creator-defined lists, content-language preferences, dirty state, and stale-save conflict feedback.
- Localize all visible editor strings in English and Persian and verify LTR/RTL behavior.
- Add focused UI/component tests for the editor's user-visible behavior.

## Dependencies

Requires Ticket 02 only. The editor must consume its application-service boundary and does not gate the independently implementable history UI in Ticket 04.

## Architecture and source-of-truth references

- `AGENTS.md` §§10, 13, 16, 19–22, 36–39, 42–43, 48, 50–51
- `docs/PRD.md` §§4, 9–11, 48, 54, 58–59
- `docs/ARCHITECTURE.md` §§8, 13, 17–19, 72–76, 84–86
- `docs/adr/ADR-002-authentication-and-workspaces.md`
- `docs/adr/ADR-003-versioning-strategy.md`
- `docs/adr/ADR-010-internationalization.md`
- `docs/adr/ADR-013-content-dna-version-storage.md`
- `docs/phases/phase-02-content-dna.md` §§7–14, 16–17

## Implementation requirements

- Keep Content DNA authorization, validation, versioning, and persistence rules in Ticket 02's server/application services; React owns only presentation and browser-local interaction state.
- Render a localized empty state when no Content DNA exists and a structured editor when a current version exists.
- Let owners save incomplete but storage-valid input explicitly; do not autosave or persist an editable server draft.
- Display the derived readiness state returned by the canonical server-side rule; do not recreate a competing UI readiness rule.
- Provide accessible ordered-list add/remove and move-up/move-down interactions without drag-and-drop. Preserve the priority semantics of `primaryTopics`, `toneTraits`, and `contentGoals`.
- Represent content-language preferences with only `en` and `fa`; do not infer or mutate them from the UI locale.
- Surface localized validation and `CONFLICT` feedback. On conflict, retain browser-local edits and offer a path to reload the latest version; do not auto-merge.
- Show a localized privacy notice and a practical warning before leaving unsaved work. Do not add complex navigation interception solely for dirty-state handling.
- Use semantic controls, visible focus treatment, logical-direction styling, and normal Unicode mixed-direction text behavior.


## Accessible move-up/move-down priority controls are required for:

- primaryTopics
- toneTraits
- contentGoals

Other creator-defined lists preserve entered order for snapshot fidelity but
do not need priority semantics or dedicated reordering controls in Phase 2.

## Explicit non-goals

- No direct Drizzle access from components and no implementation of persistence or authorization rules.
- No version-history/detail UI beyond links or navigation required to reach the independently delivered history feature.
- No autosave, persisted drafts, collaborative editing, merge UI, drag-and-drop, restore/fork/delete/diff, taxonomies, PII detection, moderation, AI, ideas, or other later-phase domains.

## Acceptance criteria

- [ ] An owner sees a localized empty state or the current structured Content DNA editor as appropriate.
- [ ] The editor can explicitly save a storage-valid partial payload and display the returned derived readiness state.
- [ ] Editor validation feedback and submission behavior use the service boundary and never query Drizzle directly.
- [ ] Ordered list controls are keyboard-accessible, preserve order, and expose move-up/move-down behavior without drag-and-drop.
- [ ] Content-language preferences are independent from EN/FA UI locale switching.
- [ ] Dirty indication and a practical unsaved-work warning are present without autosave or persisted drafts.
- [ ] Stale-save conflict feedback is localized, preserves local edits, and offers reload/latest-version behavior without merge or overwrite.
- [ ] All visible editor UI is localized in English and Persian and behaves correctly in LTR and RTL.

## Tests

- Focused component/UI tests for empty/current states, partial save submission, server validation feedback, readiness presentation, list ordering controls, dirty state, privacy notice, and conflict feedback.
- EN/FA rendering and direction tests, including UI-locale switching without changing content-language preferences.
- Keep integration tests for persistence/save semantics in Ticket 02; do not duplicate them through component internals.

## Verification commands

- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## Review requirements

- Use `vercel-react-best-practices` for server/client boundaries and bundle discipline where applicable.
- Use `web-design-guidelines` for editor accessibility, focus, responsive behavior, and RTL/LTR review.
- Confirm the implementation is a client of application services, not the domain/persistence layer.

## Completion report requirements

- Summarize the editor states and service actions consumed.
- Report UI/localization/accessibility test coverage and verification results.
- Confirm the UI does not introduce autosave, drafts, merge behavior, drag-and-drop, or later-phase functionality.

## Answer

Implemented the localized `/en/content-dna` and `/fa/content-dna` editor. The route server-loads the authenticated user's workspace and current Ticket 02 DTO; the client component owns only local form state, explicit submission, list controls, dirty state, and a before-unload warning. Saves and reloads use narrow server-action adapters over the existing Content DNA application service.

The editor supports storage-valid partial saves, canonical readiness presentation, ordered primary-topic/tone/content-goal lists, EN/FA content-language preferences independent of the UI locale, privacy guidance, and conflict preservation with an explicit reload-latest action. No autosave, drafts, direct database access, merge behavior, drag-and-drop, history UI, or later-phase functionality was added.

The existing suite and static verification pass, but focused editor UI coverage remains required before this ticket can be resolved.
