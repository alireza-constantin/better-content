# Phase 5 — Structured Content Editor and Production Direction

**Status:** Approved / complete

**Decision owners:** Product Architect / Technical Lead

**Prerequisites:** Phase 4 complete; approved Phase 5 discovery decisions Q1–Q18

**Required before implementation:** approved Phase 5 implementation tickets

## Problem Statement

Phase 4 gives creators a revisioned plain-text Script Draft and preserves the initial AI-generated Script as immutable Version #1. That temporary textarea is inadequate for long creator scripts, particularly Persian/RTL work, and cannot express the production intent attached to a Script: how a creator should perform it and how footage should be edited.

Creators need a purpose-built, readable production-script editor. It must keep Script, Performance Direction, and Edit Direction together in one Content document; preserve exact historical AI and legacy Draft artifacts; support safe autosave and acceptance; and avoid becoming a generic rich-text editor, video timeline, or collaboration system.

## Solution

Phase 5 introduces canonical `ContentDocumentV2`, a schema-versioned JSONB document with an ordered Script of stable-ID paragraph blocks. Each block owns ordered Performance Directions and Edit Directions. Directions are manually authored, block-scoped, typed, strictly validated, and stored inside their owning block.

The editor is a purpose-built React block editor. It uses one native textarea per paragraph block and the V2 document as its only editable model. It keeps whole-document optimistic autosave from Phase 4, adds meaningful immutable acceptance snapshots and read-only Version History, and lazily preserves a legacy V1 Draft before moving it to V2.

## User Stories

1. As a creator, I want my Script split into ordered production paragraphs, so that I can organize recording and editing work around meaningful units.
2. As a creator, I want each paragraph to retain a stable identity while I edit it, so that its Production Directions remain attached.
3. As a creator, I want to split a paragraph at the cursor, so that a new production unit can begin at a natural point.
4. As a creator, I want to merge adjacent paragraphs, so that I can revise script structure without losing attached directions.
5. As a creator, I want to move paragraphs up and down, so that the recording order reflects my intended narrative.
6. As a creator, I want to add a Performance Direction to a paragraph, so that I can describe how it should be delivered or recorded.
7. As a creator, I want to add an Edit Direction to a paragraph, so that I can communicate post-production intent beside the relevant Script.
8. As a creator, I want directions displayed beside their owning paragraph, so that production context never becomes detached from the Script.
9. As a creator, I want direction controls to remain visually secondary, so that a long Script remains readable.
10. As a creator, I want to add nuanced performance or editing notes, so that a small typed taxonomy does not force inaccurate instructions.
11. As a creator, I want text and directions to autosave safely, so that work is durable without creating a Version per edit.
12. As a creator, I want a conflict to preserve my complete unsaved work, so that another tab cannot silently overwrite it.
13. As a creator, I want to copy a readable recovery export during a conflict, so that I can keep my work without handling JSON.
14. As a creator, I want to accept a completed Draft, so that one immutable Version becomes the currently approved artifact.
15. As a creator, I want to keep editing after acceptance, so that experimentation does not destroy the previously approved Version.
16. As a creator, I want to see whether my Draft has unaccepted changes, so that I know what future publishing would use.
17. As a creator, I want to inspect immutable Version History, so that I can distinguish generated, migration-preserved, and accepted artifacts.
18. As a creator, I want historical Versions to be read-only, so that I never accidentally edit history instead of the current Draft.
19. As a creator with legacy Phase 4 work, I want its exact V1 Draft preserved before structured editing changes it, so that no human-authored text is lost.
20. As an English-UI creator writing Persian content, I want the Script editor to be RTL with Persian typography, so that UI locale never compromises creator-content editing.
21. As a Persian-UI creator writing English content, I want the Script editor to stay LTR with English typography, so that content language remains independent.
22. As a creator using mixed Persian and English text, I want the browser’s normal bidi behavior preserved, so that text is never reversed or transformed.
23. As a keyboard user, I want predictable split, merge, movement, direction, dialog, and focus behavior, so that the editor is usable without a pointer.
24. As a mobile creator, I want block-local direction summaries and accessible bottom sheets, so that the editor remains practical on a narrow screen.
25. As a screen-reader user, I want Script blocks, direction lists, status changes, and read-only history clearly announced, so that the editor communicates its state.
26. As an operator, I want validated, versioned JSONB documents and same-Content acceptance integrity, so that Content lineage remains trustworthy for future publishing and learning.

## Implementation Decisions

### Canonical document

- The current editor document is `ContentDocumentV2`:

  ```text
  schemaVersion: 2
  script
    blocks[]
      id: stable UUID
      type: paragraph
      text: plain Unicode without CR/LF
      performanceDirections[]
      editDirections[]
  ```

- `script` remains an explicit document namespace, evolving V1 `script.text` into `script.blocks`.
- Blocks are ordered by array order. Directions are separately ordered by array order within their category. No redundant position properties are stored.
- A V2 document has 1–1,000 blocks and no more than the existing 50,000-character Script limit. The Script has at least one block; a blank Draft is one empty paragraph block.
- Block IDs are unique within the document. Direction IDs are unique across all Performance and Edit Directions in that document. IDs are never reused after deletion during an editor session.
- Every block always contains both direction arrays, even when empty. Optional direction fields are omitted rather than represented as `null`.
- A block has at most 12 Performance Directions and at most 12 Edit Directions. A document has at most 300 Production Directions across every block and category. These are canonical V2 limits; directions remain embedded JSONB document data, not relational rows.
- Validation is strict at every layer. Unknown document, Script, block, direction, and payload keys are invalid. Canonical validation remains authoritative on the server.
- A whitespace-only block with no directions is redundant and is removed. Nonblank retained text is preserved exactly and is never trimmed. An empty or whitespace-only block that owns any Production Direction remains semantic and persists. If removal would leave no blocks, canonicalization creates exactly one empty, direction-free paragraph block with `text: ""`; canonicalization always leaves 1–1,000 blocks.

### Script editing and anchoring

- Phase 5 has exactly one block type: `paragraph`. It has no headings, scenes, lists, quotes, Markdown, rich-text marks, links, inline code, hard-break nodes, or arbitrary formatting.
- Enter splits the current block when IME composition is inactive. The original block retains its ID, text before the caret, and all existing directions; the new trailing block has a fresh ID and no directions.
- Backspace at the beginning of a block merges it into the preceding block when composition is inactive. The preceding block survives; directions from the removed block transfer in their relative category order without changing direction IDs.
- Reordering a block moves all its directions with it. Explicit deletion of an empty direction-free block may occur immediately. Deleting a block with text or any directions requires confirmation.
- Production Directions attach structurally to exactly one whole Script block. There are no ranges, offsets, text selections, cross-block anchors, overlaps, anchor recovery, or speculative anchor wrappers. `EMPHASIS` and `CAPTION_EMPHASIS` are block-scoped.
- Pasted multiline text is segmented into blocks. Whitespace-only lines are discarded; retained lines are preserved exactly and never trimmed, Unicode-normalized, or language-detected. Candidate mutations must satisfy all V2 limits atomically.

### Production Direction taxonomy

- Performance Direction is a separate strict discriminated union containing `PAUSE`, `EMPHASIS`, `DELIVERY`, `GESTURE`, `POSITION`, `GAZE`, and `PERFORMANCE_NOTE`.
- `PAUSE` has `duration: short | medium | long`; `EMPHASIS` has `strength: subtle | clear | strong`; `DELIVERY` requires at least one field and permits `tone: calm | warm | serious | energetic | playful` and/or `pace: slower | faster`; `GESTURE` has `kind: hand | point | show_object`; `POSITION` has `action: sit | stand | walk`; `GAZE` has `target: camera | away`; `PERFORMANCE_NOTE` has primary text of at most 500 characters.
- Edit Direction is a separate strict discriminated union containing `TEXT_OVERLAY`, `ZOOM`, `CUT`, `BROLL_CUE`, `SOUND_CUE`, `CAPTION_EMPHASIS`, and `EDIT_NOTE`.
- `TEXT_OVERLAY` requires text of at most 280 characters and `placement: top | center | bottom`; `ZOOM` requires `mode: in | out` and `intensity: subtle | normal | strong`; `CUT` requires `style: hard | jump`; `BROLL_CUE` requires conceptual description of at most 500 characters; `SOUND_CUE` requires `kind: music | sound_effect` and description of at most 280 characters; `CAPTION_EMPHASIS` requires `style: highlight | animate`; `EDIT_NOTE` has primary text of at most 500 characters.
- A structured direction other than `PERFORMANCE_NOTE` or `EDIT_NOTE` may have an optional nuance note of at most 280 characters. The two `*_NOTE` fallback types have no common optional nuance-note field because their primary text is the instruction. No generic `OTHER` exists.
- No Phase 5 direction references an asset, file, URL, upload, selected media, generated media, timeline position, transition, crop/reframe, or camera framing.

### Editor and presentation

- Use a purpose-built React block editor. The editor aggregate owns the complete V2 working document; individual native textareas do not own canonical persistence state. Blocks are rendered with stable block-ID keys, never array indexes.
- Native textareas are the editing primitive for browser selection, clipboard, IME, screen readers, mobile keyboards, Persian text, and bidi behavior. Do not add Lexical, TipTap, ProseMirror, a shared `contenteditable`, an editor-framework document state, or an adapter layer.
- The desktop editor is one vertical, Script-first flow. Directions are directly beneath their owning block as compact chips. Empty categories use compact add affordances rather than permanent empty rows. Performance and Edit groups have independently collapsible presentation state.
- Popovers serve small direction payloads; larger text-focused direction forms may use dialogs. Mobile uses accessible bottom sheets for direction creation and editing. Editor presentation state is local only and never affects document equality, autosave, Draft revisions, or Versions.
- Block and direction movement uses explicit move controls; drag-and-drop is not required. Essential actions must not be hover-only.
- Content language, not UI locale, controls creator-content `lang`, `dir`, and globally defined typography across the editor and Version previews. System labels use UI locale. Creator-authored direction text inherits Content language. Mixed-language content relies on native Unicode/browser bidi behavior.

### Autosave, migration, and concurrency

- Preserve Phase 4 whole-document optimistic autosave. Every text, block, or direction operation mutates local V2 state; debounced saves submit the complete document with a base revision.
- Only one save may be in flight. Later mutations coalesce into one latest follow-up save. A success advances the persisted revision/baseline but never overwrites newer local state.
- The client canonicalizes save candidates for UX; the server independently authorizes, checks the authoritative revision, strictly validates and canonicalizes the full document, replaces the Draft atomically, and increments revision. Client normalization is convenience only; server canonical validation is authoritative.
- A revision conflict stops autosave, retains the complete local document, and offers intentional Reload plus Copy unsaved. Reload replaces the entire local aggregate; no automatic merge, retry, patch protocol, operation log, CRDT, collaboration, or offline queue is introduced.
- Copy unsaved produces a deterministic, localized, human-readable recovery export in Script and direction order. It includes no JSON, IDs, UUIDs, or persistence metadata and is not importable.
- Existing V1 Drafts remain V1 when merely viewed. The editor creates a temporary V2 projection that is not dirty solely because its schema differs.
- On the first actual V2 mutation/save of a V1 Draft, one transaction verifies the expected V1 revision, creates one `LEGACY_DRAFT_CHECKPOINT` containing the exact stored V1 document value, writes canonical V2 Draft, and increments the Draft revision. Failures and conflicts create neither checkpoint nor V2 mutation.
- V1 segmentation is deterministic: split on LF, discard Unicode-whitespace-only lines, retain all other text exactly, and produce one empty block if no retained lines remain. UUID materialization is intentionally fresh before first V2 persistence.
- A legacy Draft whose projection exceeds 1,000 blocks fails with a stable validation result and remains V1 without writes, truncation, joining, or silent repair.
- New Content generated after Phase 5 begins retains V1 AI Run output and V1 `AI_GENERATED` Version #1, while its mutable Draft is immediately derived as canonical V2. This deliberately supersedes the Phase 4 initial serial-equality rule while preserving Script meaning and AI provenance.
- Provider execution remains outside the database transaction. After validated V1 provider output exists, the existing successful-generation transaction remains all-or-nothing: it creates Content, persists exact V1 Version #1, creates canonical V2 Draft, completes the AI Run and Attempt, and performs the existing Production Queue exit/source-Idea queue-position clearing in the same transaction. A failure or rollback creates no partial Content, Draft, or Version and does not clear queue membership. The same shared generation path and invariant apply to normal generation, Retry, and Generate Another.

### Versions and acceptance

- Phase 5 Version sources are limited to existing `AI_GENERATED`, migration-only `LEGACY_DRAFT_CHECKPOINT`, and acceptance-only `CREATOR_ACCEPTED`. Autosave and normal V2 editing never create Versions.
- Content Version documents support the validated V1-or-V2 document union. `AI_GENERATED` retains its required linked AI Run; `LEGACY_DRAFT_CHECKPOINT` and `CREATOR_ACCEPTED` have no AI Run link. The existing unique AI Run association therefore becomes nullable for non-AI Version sources while retaining uniqueness for linked AI-generated artifacts.
- Content gains a nullable `acceptedVersionId`. If non-null, it must reference a Version belonging to the same Content and that Version must have source `CREATOR_ACCEPTED`; `AI_GENERATED` and `LEGACY_DRAFT_CHECKPOINT` can never be the current accepted pointer. It is the current approval pointer, not a Content status or Draft-revision field.
- PostgreSQL must enforce same-Content association with the strongest practical relational invariant, preferably a composite relationship from `(contents.id, contents.acceptedVersionId)` to a candidate-unique `(content_versions.content_id, content_versions.id)`. Application validation remains authoritative for the `CREATOR_ACCEPTED` source restriction. If the current schema cannot support safe database enforcement, ADR reconciliation must flag the issue rather than weakening the invariant.
- Acceptance is available only for a durably saved, non-conflicted Draft. The server authorizes, locks, verifies expected Draft revision, validates the authoritative Draft, then evaluates idempotency.
- If the current accepted Version already has canonically equal content, acceptance returns it without creating a Version. A Draft equal to an older non-current Version still creates a new `CREATOR_ACCEPTED` Version because it is a new approval event.
- Acceptance creates the next serialized per-Content Version number and atomically updates `acceptedVersionId`. Concurrent identical accepts yield one Version; save/accept races follow the established Draft locking and revision discipline.
- Accepting a legacy V1 Draft is meaningful migration intent. One transaction creates the legacy checkpoint, writes V2 Draft, advances revision, creates V2 accepted Version, and updates the pointer; it rolls back entirely on failure.
- Current Draft, accepted Version, and unaccepted changes are derived from the accepted pointer and canonical document equality. Editing after acceptance does not clear the pointer or mutate history.
- Version History is an editor-integrated, compact read-only experience. It lists Version number, source, timestamp, applicable author, and the one currently accepted marker. It previews V1 and V2 documents through read-only presentation adapters without writes or migration. Current Draft remains visually distinct from history.

### Accessibility and mobile

- The editor is a labeled semantic region with an ordered Script structure. Blocks convey their ordinal position; Performance and Edit directions are separately labeled lists. Direction chips are accessible edit buttons with meaningful summaries.
- Focus/caret behavior is part of correctness: split focuses the new block at start; merge focuses the survivor at the merge boundary; add focuses the new block; delete focuses a logical neighbor; move preserves focus on the moved block.
- Structural keyboard commands are disabled during IME composition. All structural and direction controls are keyboard operable.
- Popovers, dialogs, and mobile sheets provide title, dialog semantics, initial focus, focus containment, Escape dismissal where applicable, explicit close/cancel, and focus restoration.
- Announce failure, conflict, migration-blocking, and acceptance outcomes appropriately. Do not spam assistive technology for normal autosave state changes.
- Phase 5 provides native textarea undo only for ordinary typing. It does not promise document-wide undo for structural or direction operations, and it does not claim Version History or conflict copy is universal recovery for persisted unaccepted changes.

## Testing Decisions

- Use the lowest reliable test layer. Test externally observable domain behavior and integrity rather than implementation details or component internals. Do not duplicate exhaustive acceptance criteria in Playwright.
- Unit/domain tests cover V1 segmentation and V2 materialization, strict validation, canonicalization, block limits, canonical document equality, split/merge/reorder semantics, direction transfer and order, multiline-paste normalization, direction unions, and readable conflict export.
- Component tests cover native-block editing, IME/composition safety, split/merge focus and caret restoration, block-delete safeguards, move controls, direction create/edit/delete/reorder controls, autosave coalescing UI behavior, conflict/reload/copy states, acceptance gating, semantic EN/FA `lang`/`dir`, controlled announcements, read-only history context, dialogs, sheets, and keyboard operation.
- PostgreSQL integration tests cover authorization and nondisclosure, same-Content accepted-pointer integrity and rejected non-`CREATOR_ACCEPTED` pointers, per-Content Version-number serialization, concurrent Accept+Accept idempotency, Draft-save/Accept races, normal acceptance, atomic V1 checkpoint migration, legacy acceptance migration, rollback invariants, V1 block-limit no-write behavior, revision conflict behavior, and generation transaction atomicity including Production Queue exit.
- Use existing Content domain contracts, Draft application services, Content read services, editor component/autosave hook, integration persistence tests, and existing Content Playwright journeys as the primary seams. New seams should remain at these module/application boundaries rather than expose database access to React.
- Keep Playwright deliberately small: at least one representative EN/LTR persisted structured-editor journey and one representative FA/RTL persisted structured-editor journey. These may cover editing, directions, autosave, acceptance, history, and legacy migration where practical. They must use deterministic provider wiring and not live AI.
- Manual QA must cover English and Persian desktop/mobile, mixed-direction content, long Persian Scripts, block/direction density, mobile sheets, Version History distinction, and a 10–15 minute editing session that explicitly evaluates whether missing document-wide structural undo feels unsafe or frustrating.

## Out of Scope

- AI-generated, suggested, regenerated, or automatically applied Production Directions; AI Script rewrite, inline rewrite, scoring, or review.
- Rich text, marks, headings, lists, arbitrary blocks, text-range anchors, inline annotations, range recovery, and per-block language/direction overrides.
- Asset management, image/video overlays with asset references, uploads, generated media, real video timeline behavior, timing tracks, crop/reframe, transitions, camera framing, or publishing/analytics.
- Collaboration, comments, mentions, presence, sharing, CRDTs, patch APIs, offline queues, automatic merge, and document-wide structural undo.
- Manual snapshots, restore/revert, Version editing/deletion/labels/diffs/branching, or a separate Version History product surface.
- New editor frameworks or new AI/provider policies.

## Further Notes

- ADR-003 and ADR-004 have been reconciled with the accepted-pointer lifecycle, meaningful Version sources, conditional AI Run linkage, V2 embedded-block model, canonical limits, and preserved V1 history. ADR-016 remains Script-generation-only; it does not authorize AI-generated directions.
- The Phase 5 architecture/spec must explicitly reconcile the Phase 4 rule that AI output, Version #1, and initial Draft shared V1 serialization. After Phase 5, AI output and Version #1 retain their exact stored V1 document values while new mutable Drafts are V2 deterministic editor representations. Historical V1 Versions and AI Run outputs are never rewritten into V2.
- Preserve all existing workspace authorization requirements: authenticated user, workspace membership, and Content ownership are required for every private read or mutation.
- No implementation tickets are created by this specification. Ticket decomposition and review occur only after this specification and ADR amendments are approved.

