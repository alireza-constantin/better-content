# 10: Edit Guide

**What to build:** Add the approved post-completion Phase 5 extension that lets
creators follow the complete post-production plan for an accepted Content
Version in a dedicated, read-only Edit Guide. The view presents each ordered
Script block together with the Edit Directions anchored to that block.

**Scope note:** Phase 5 remains historically complete. This ticket is a
post-completion presentation/use mode of the structured Script + Production
Direction model; it must not rewrite the historical Phase 5 scope, acceptance
record, or resolved ticket history.

**Approved:** 2026-09-09. Implemented and resolved on 2026-09-09.

**Blocked by:** Completed Phase 5 Tickets 05–06, Ticket 08 (the existing
Teleprompter entry/action convention), Ticket 09 (V4 and B-roll search-query
compatibility), and Phase 6 Asset integration. These are existing
prerequisites, not work to reopen in this ticket.

**Status:** resolved

## Authority and architecture

- Follow the current Product Requirements and architecture sections for
  Structured Content, acceptance and immutable Versions, Teleprompter, and
  Assets; the Phase 5 Edit Guide amendment; the Phase 6 Asset presentation
  rules; and the relevant accepted ADRs: ADR-001, ADR-002, ADR-003, ADR-004,
  ADR-010, ADR-018, and ADR-019. No new ADR is expected.
- Preserve the existing modular-monolith flow:

  ```text
  UI → Content application/read service → domain/repository and Asset capability boundary
  ```

- The production authority is always:

  ```text
  Mutable Draft → Accept → immutable Content Version → Edit Guide
  ```

- The normal entry point must resolve `Content.acceptedVersionId` on the
  server, authorize the Workspace and Content, load that same-Content
  immutable `CREATOR_ACCEPTED` Version, validate/project its document through
  the existing V1/V2/V3/V4 presentation rules, and return a safe read-only Edit
  Guide DTO.
- React components receive only the DTO and own presentation-only state. They
  must not import Drizzle, repositories, storage adapters, or server-only
  authorization code.
- Do not add `EditSession`, `EditingSession`, checklist persistence, a new
  Content document schema, a new Asset relationship, or a new direction
  taxonomy. No database migration is expected.

## Required server and entry behavior

- Add a dedicated locale-aware Edit Guide route/view using the existing Next.js
  App Router and Content route conventions. Keep the existing session,
  Workspace, `lang`, and `dir` boundaries.
- Add an **Edit Guide** action alongside the existing **Teleprompter** action
  on the normal Content detail/editor surface only when an accepted Version is
  available. The normal action must not accept an arbitrary client-selected
  Version as its authority.
- If no accepted Version exists, keep the action unavailable or use the
  existing localized accept-first guidance convention. Never render the
  mutable Draft as an Edit Guide.
- Resolve the accepted pointer on every server load. Draft changes after
  acceptance must not change the already accepted Version or the next Edit
  Guide load. Re-accepting a new Version must make the normal entry point
  resolve that new Version.
- If the pointer is missing, mismatched, invalid, deleted, or not a valid
  `CREATOR_ACCEPTED` Version, fail closed. Do not fall back to Draft content or
  reveal foreign/invalid Version identity; an otherwise authorized request may
  receive only the stable localized unavailable state used by the product.
- Foreign Workspace, non-member, unauthenticated, and otherwise unauthorized
  requests must remain nondisclosing under the existing Content authorization
  boundary.
- The DTO may contain only the safe view data required for the Content identity,
  accepted Version metadata if displayed, Content language, ordered Script
  blocks, Edit Directions, and safe current Asset presentation/capability
  seams. Never expose source URLs, storage keys, signed capability persistence,
  provider/storage credentials, raw database rows, or mutable Draft metadata.

## Required rendering behavior

- Render Script blocks in their canonical stored order, preserving exact
  creator text and the stable association between each block and its own Edit
  Directions. Do not flatten directions into unrelated document-level content.
- Support accepted V1, V2, V3, and V4 Versions through existing
  projection/presentation compatibility. V1 must remain readable even when it
  has no structured Edit Directions; historical Versions must not be rewritten,
  migrated on read, or mutated.
- Present every existing Edit Direction variant with a clear semantic type
  label and payload presentation:

  | Variant | Required presentation |
  | --- | --- |
  | `TEXT_OVERLAY` | Overlay copy/instruction, including its existing placement/value where applicable. |
  | `ZOOM` | Zoom instruction, including existing mode/intensity values where applicable. |
  | `CUT` | Cut instruction and existing cut style/value. |
  | `BROLL_CUE` | B-roll description, optional search query, and optional safe Asset presentation. |
  | `SOUND_CUE` | Sound kind/instruction and description, plus optional safe Asset presentation. |
  | `CAPTION_EMPHASIS` | Caption-emphasis instruction and existing style/value. |
  | `EDIT_NOTE` | General editor note text. |

- Preserve existing optional nuance/details where the current presentation
  rules expose them. Direction type must remain understandable without color;
  use semantic headings, labels, text, grouping, or icons with accessible
  names as appropriate.
- The primary view is Script plus Edit Directions. A small optional control may
  reveal Performance Directions for context only if it remains simple;
  Performance Directions must be hidden by default, must never become editing
  controls, and must not turn this view into a Structured Editor.

## B-roll, Sound Cue, and Asset behavior

- For `BROLL_CUE`, show the human-facing description, show `searchQuery` when a
  canonical query is present, and provide an accessible **Copy search query**
  action. Copy the exact current query value; do not trim, translate, rewrite,
  save, version, revise, or otherwise mutate Content as a side effect.
- Copy success, denial, or unavailable clipboard behavior must produce clear,
  localized, accessible feedback without turning a clipboard failure into a
  Content error. Omit or disable the action when no query is present.
- When a B-roll `assetId` exists, present the current safe Asset display data
  and reuse the existing private image/video preview capability where the
  Asset is available and compatible. When no `assetId` exists, show the
  instruction normally without an empty or misleading Asset state.
- If an attached Asset is unavailable, missing, not previewable, or has been
  removed from the safe presentation result, preserve the B-roll direction and
  show a localized unavailable state. Never expose private storage/source
  fields and never replace the immutable direction with a new Asset.
- For `SOUND_CUE`, show the existing sound kind and instruction/description. If
  an Asset is attached, reuse the approved safe Asset presentation and native
  audio preview primitive where applicable. Do not build a custom audio
  editor/player.
- Respect existing Asset compatibility: B-roll uses eligible IMAGE/VIDEO
  Assets and sound cues use eligible AUDIO Assets. The Edit Guide does not
  search, import, attach, replace, or delete media and does not create another
  authoritative Asset relationship.

## Read-only responsive presentation

- The Edit Guide is a dedicated production-oriented view, not a second editor.
  There are no Script, direction, query, or Asset mutation controls. Creators
  return to the Structured Editor to change Content.
- On desktop, use a clear two-column or similarly readable layout pairing the
  Script context with the associated Edit Directions. Do not sacrifice the
  block association for a global direction list.
- On narrow/mobile screens, stack each Script block followed by its Edit
  Directions. Do not force a desktop two-column layout onto a narrow viewport.
- Preserve readable typography, large-text usability, responsive touch
  targets, visible focus, and no horizontal overflow. Use existing shadcn/ui
  primitives, logical CSS properties, and the established frontend standards.

## Internationalization and accessibility

- Support English/LTR and Persian/RTL through the existing locale routing and
  root semantics. UI labels and status messages use the UI locale; creator
  Script, directions, search queries, and Asset names remain in their actual
  Content values and are never translated or reversed.
- Content language controls the semantic `lang`/`dir` and content typography
  for creator-authored values independently of UI locale. Mixed Persian/Latin
  Script, direction text, search queries, and Asset names must use native
  Unicode bidi behavior (`dir="auto"`, `bdi`, or the equivalent established
  presentation seam) rather than manual string reversal.
- Use semantic headings and regions, ordered Script structure, labeled Edit
  Direction groups, clear direction type labels, accessible Copy controls,
  meaningful Asset preview labels/alternative treatment, visible focus, and
  keyboard-operable controls.
- Do not rely on color alone to distinguish direction types. Keep the view
  usable at large text sizes and on touch devices. Preview failures and copy
  feedback must be perceivable without depending only on color or transient
  visual decoration.

## Acceptance criteria

### Authorization and immutable Version authority

- [x] An authorized creator sees the current immutable accepted Version at the
      normal Edit Guide entry point.
- [x] Every normal load resolves `Content.acceptedVersionId` server-side and
      does not accept a client-selected arbitrary Version as production
      authority.
- [x] Editing the mutable Draft after acceptance does not change the Edit Guide
      for the already accepted Version, whether it is already open or loaded
      again.
- [x] Re-accepting a new Version makes the next normal Edit Guide entry point
      render that new accepted Version.
- [x] A Content without an accepted Version shows localized accept-first
      guidance or an unavailable action and never renders Draft content.
- [x] A missing, mismatched, invalid, deleted, or non-`CREATOR_ACCEPTED`
      accepted pointer fails closed with no Draft fallback and no identity
      disclosure.
- [x] Foreign Workspace, non-member, unauthenticated, and invalid-ownership
      requests remain nondisclosing under the existing Content authorization
      boundary.
- [x] The server returns only safe immutable presentation data, and Edit Guide
      React components contain no database or server-authorization access.

### Rendering and historical compatibility

- [x] Script block order and exact creator text are preserved.
- [x] Each Edit Direction remains associated with the correct Script block and
      preserves its stored order.
- [x] Every existing Edit Direction variant (`TEXT_OVERLAY`, `ZOOM`, `CUT`,
      `BROLL_CUE`, `SOUND_CUE`, `CAPTION_EMPHASIS`, and `EDIT_NOTE`) has a
      semantic, readable presentation of its existing payload.
- [x] Direction types are distinguishable without color-only cues and remain
      understandable with assistive technology.
- [x] Accepted V1, V2, V3, and V4 Versions render through existing
      compatibility/projection behavior without read-time migration, writes,
      or historical mutation.
- [x] UI locale changes do not translate, rewrite, reverse, or otherwise mutate
      creator Script, direction text, search queries, or Asset names.
- [x] Mixed Persian/Latin creator Content remains bidi-safe in both UI locales.
- [x] If the optional Performance Direction context control is implemented, it
      is off by default, presentation-only, accessible, and does not alter the
      Script/Edit Direction view.

### B-roll and Copy behavior

- [x] A B-roll description is shown in its owning block's Edit Guide section.
- [x] A present B-roll `searchQuery` is shown exactly as Content data and an
      accessible Copy search query action is available.
- [x] Copying succeeds through the browser clipboard seam when available and
      reports localized accessible success/failure feedback.
- [x] Copying does not mutate the Content document, Draft, revision,
      accepted Version, Version History, or any other persisted state.
- [x] A B-roll cue without an Asset renders correctly without a fake Asset
      placeholder or error.
- [x] A B-roll cue with an attached Asset presents safe current Asset metadata
      and the existing compatible private image/video preview where available.
- [x] An unavailable Asset leaves the B-roll instruction visible and reports a
      localized safe unavailable state without leaking private fields.

### Sound Cue and Asset behavior

- [x] A Sound Cue renders its existing kind and instruction/description.
- [x] An attached Sound Cue Asset uses safe current Asset presentation and the
      existing native audio preview primitive where applicable.
- [x] Asset presentation supports the existing safe image, video, and audio
      treatment without exposing `sourceUrl`, storage keys, signed capability
      persistence, credentials, or raw provider/storage data.
- [x] Asset availability or preview failure cannot change the Version's
      `assetId`, create another relationship, or hide its direction.
- [x] No Media Discovery, automatic attachment, or Asset mutation is introduced.

### Layout, responsive behavior, and read-only boundaries

- [x] The Content surface exposes **Teleprompter** and **Edit Guide** actions
      alongside one another when an accepted Version exists.
- [x] The dedicated Edit Guide is readable in the intended desktop two-column
      or equivalent production layout, with Script context visibly paired to its
      directions.
- [x] On mobile/narrow screens, each Script block is followed by its Edit
      Directions in a stacked layout; no forced desktop columns or horizontal
      overflow remain.
- [x] The view contains no editing, autosave, checklist, completion,
      collaboration, comment, or timeline controls. Copy is the only permitted
      Content-adjacent action.
- [x] Large text, keyboard focus, touch targets, and Asset previews remain
      usable at responsive breakpoints.

### EN/FA and accessibility

- [x] English UI renders LTR and Persian UI renders RTL with accurate locale
      semantics and logical CSS.
- [x] Creator Content language remains independent of UI locale, including when
      Persian Content is viewed in English UI and English Content in Persian UI.
- [x] Headings, regions, ordered blocks, Edit Direction groups, labels, Copy,
      status feedback, and Asset previews have meaningful accessible semantics.
- [x] All visible actions are keyboard operable with visible focus, and copying
      does not rely on pointer-only interaction.
- [x] Direction type distinction, Asset availability, preview errors, and
      clipboard feedback do not depend on color alone.

## Test layer

- **Unit/domain or projection tests:** cover the read-only V1/V2/V3/V4
  projection used by the Edit Guide, canonical block/direction order, payload
  presentation for all seven Edit Direction variants, optional V4
  `searchQuery`, safe unavailable-Asset presentation, and no translation or
  string reversal of creator values. Reuse existing domain helpers where they
  prove the behavior; do not create a new document taxonomy for the view.
- **Application/PostgreSQL integration tests:** cover authenticated
  Workspace/Content authorization, nondisclosure, accepted-pointer resolution,
  no-accepted and invalid-pointer fail-closed states, Draft-after-acceptance
  immutability, and reacceptance selecting the next Version. Reuse existing
  Content read/acceptance seams; no migration test is required because no
  schema change is expected.
- **Component tests:** cover the desktop/mobile presentation structure,
  Script-to-direction association, every direction variant, semantic labels,
  B-roll description/query/Copy success and failure, Copy's no-mutation
  behavior, B-roll/Sound Asset states and preview seams, large text/focus,
  keyboard operation, EN/FA `lang`/`dir`, and mixed-direction content.
- **Playwright E2E:** keep this to at most one representative deterministic
  persisted Edit Guide journey if the repository standards require a
  cross-boundary test. It should cover authorized navigation from Content with
  an accepted Version, one B-roll query/Copy path or attached Asset path, and
  one localized reading state. Do not create a direction-variant × locale ×
  viewport matrix.
- **Manual product/UX QA:** check representative English and Persian desktop
  and mobile layouts, long/mixed-direction Script and queries, direction
  density, readable block association, keyboard/focus behavior, safe media
  previews, unavailable Assets, clipboard feedback, and large text.

## Explicit V1 exclusions

- Video editing, audio editing, timeline, draggable clips, recorded footage
  management, frame/timecode editing, crop/reframe, transitions, rendering,
  rendered video preview, or publishing.
- `EditSession`, `EditingSession`, checklist/completion persistence, editing
  progress, collaboration, comments, mentions, or shared editing state.
- A second editing path for Script, directions, search queries, or Asset
  attachments. All changes remain in the Structured Editor.
- Automatic editing, AI editing execution, AI rewrite/review/scoring, or a new
  AI operation.
- Automatic Media Discovery, provider search, result previews, licensing or
  provenance records, automatic import, or automatic Asset attachment.
- New Content document schemas, relational direction rows, new Asset
  relationships, new direction variants, range/timeline anchors, or database
  migrations.
- Draft-backed production authority, mutable Version rendering, historical
  Version rewriting, or client-selected arbitrary Version authority.
- Phase 7 Publishing work or any redesign of the broader Content navigation.

## Dependencies and blockers to raise

### Dependencies

- Phase 5 Ticket 06 accepted-Version pointer, acceptance, Version History, and
  existing Content authorization/read boundaries.
- Phase 5 Ticket 08 route/action and locale/accessibility conventions for the
  existing Teleprompter production entry point.
- Phase 5 Ticket 09 ContentDocumentV4 compatibility and optional B-roll
  `searchQuery` presentation rules.
- Phase 6 Asset integration, including `assetId`-derived relationships, safe
  current display metadata, private capability issuance, native image/video/
  audio previews, READY/ unavailable lifecycle treatment, and nondisclosure.
- Existing Content detail/editor route, `next-intl` locale routing, shadcn/ui
  primitives, logical CSS, and the repository frontend/testing standards.

### Blockers to raise before implementation

- Any requirement to use mutable Draft state, a client-selected Version, a new
  persistence model, a migration, or an additional Asset relationship.
- Any conflict with accepted Version/document compatibility, workspace
  authorization, private Asset capability, or historical immutability rules.
- Any request to add Media Discovery, editing execution, timeline/rendering,
  collaboration, checklist persistence, or Phase 7 Publishing.
- Inability to project the current accepted V1/V2/V3/V4 document safely through
  existing application boundaries without exposing private Asset fields.

## Recommended implementation order

1. Reconfirm the existing authorized Content read/acceptance seam and define a
   safe read-only Edit Guide result, including no-accepted and invalid-pointer
   states, without touching persistence.
2. Add application-level projection/read tests for accepted-pointer authority,
   Draft immutability, reacceptance, V1–V4 compatibility, block association,
   direction payloads, and safe Asset metadata.
3. Add the locale-aware Edit Guide route and the Content detail/editor action
   alongside Teleprompter, including localized accept-first/unavailable states.
4. Implement the static Script-first/Edit-Directions presentation for all
   variants, preserving block order and optional B-roll query display/Copy
   behavior.
5. Integrate existing safe image/video/audio Asset presentation and capability
   seams for attached B-roll and Sound Cue Assets, including unavailable states.
6. Complete the responsive desktop/mobile layout, EN/FA semantics, bidi-safe
   creator text, keyboard/focus behavior, semantic labels, and no-color-only
   distinction. Add the optional Performance Direction context control only if
   it remains small and off by default.
7. Run focused unit/application/component tests, the single representative E2E
   only if warranted, manual UX QA, and applicable formatting/lint/typecheck/
   test/build/diff checks. Re-open every acceptance checkbox before resolving
   the ticket.

## Comments

- Approved as a Phase 5 post-completion extension on 2026-09-09. This ticket
  records scope and acceptance criteria only; no application code, migration,
  ADR, or Phase 7 work is included.
- Implemented and resolved on 2026-09-09. Edit Guide now reads the current
  accepted immutable Version through the authorized Content read boundary,
  projects V1–V4 Script/Edit Direction data, reuses safe Asset previews, and
  keeps B-roll Copy presentation-only. No migration or new persistence model
  was required. Focused/unit/component/E2E checks passed; the full integration
  command still reports the repository's pre-existing V3/V4 fixture mismatch in
  unrelated Draft-save/acceptance tests.
