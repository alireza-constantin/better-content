# 08: Integrate Assets into the structured Content editor

**What to build:** Let creators explicitly select, replace, or detach one
compatible READY Workspace Asset from an eligible Production Direction while
preserving autosave, acceptance, recovery, and immutable Version history.

**Blocked by:** 07 — Deliver the Workspace Asset Library.

**Status:** ready-for-agent

## Scope

- Add a focused authorized Asset picker to `BROLL_CUE` and `SOUND_CUE` only.
- Reuse Library search/pagination, previews, upload/link creation entry points,
  and lifecycle polling inside the picker.
- Implement explicit Use Asset, Replace, and Detach mutations against canonical
  local V3 state and the existing serialized whole-document autosave path.
- Complete server-side reference validation/projection updates for editor save
  and acceptance and surface optimistic-concurrency recovery.
- Extend accepted/unaccepted comparison, read-only Version History, and
  human-readable recovery export/presentation for attached Assets.
- Complete responsive, keyboard, focus-return, EN/FA, RTL/LTR, and
  mixed-direction behavior for the editor integration.

## Architecture and documentation references

- Phase 6 specification ``4, 6–8, 14, 16, 19, 20, 22–24 and acceptance criteria
  3–13, 23–27, 31–34.
- ADR-018 ContentDocumentV3 authority, Workspace validation, Draft/Version
  lineage, and deletion protection.
- ADR-003 Asset-bearing Content lineage; ADR-004 V3/lazy projection.
- Canonical Phase 5 specification editor, autosave, conflict, acceptance,
  Version History, and recovery behavior.
- ADR-010; frontend engineering and automated-testing standards.
- AGENTS structured Content, immutable versions, authorization, transactions,
  frontend boundary, and accessibility rules.

## Expected behavior

- `BROLL_CUE` picker lists only compatible READY IMAGE/VIDEO Assets.
  `SOUND_CUE` lists only compatible READY AUDIO Assets. No other direction
  exposes an Asset control.
- Picker results are same-Workspace, authorized, bounded/paginated, searchable
  by approved fields, previewable, and identify the current selection.
- Upload/Add link from the picker creates a normal Workspace Asset visible in
  the Library. PENDING/PROCESSING/FAILED may be shown as lifecycle context but
  cannot be selected.
- READY completion never auto-attaches. The creator must choose Use Asset.
  Failed processing leaves the direction unchanged.
- Use/Replace modifies only the direction's optional Asset ID. Detach removes
  only that ID. Neither operation mutates/deletes old/new Asset media or
  provenance.
- The local V3 mutation enters the existing debounce/serialized autosave path.
  The server reloads authorization and validates READY/same-Workspace/type/
  cardinality/status under deterministic Asset locks before atomically saving
  the Draft and projection at the expected revision.
- Attachment differences produce normal unaccepted changes. Acceptance records
  exact Asset IDs in the immutable V3 Version and its projection; later edits
  cannot rewrite history.
- Version History can resolve safe current display name/type while preserving
  immutable identity. Recovery copy is deterministic, localized, human-readable,
  ID-free/non-importable, and excludes storage/source/signed URLs and raw JSON.
- Closing the picker returns focus to the invoking direction control.

## Implementation constraints and invariants

- ContentDocumentV3 remains the only attachment authority. Never mutate
  `asset_references` independently or infer canonical attachment from it.
- A previously loaded picker result is not authority. Server validation repeats
  at every save/acceptance and non-READY/DELETING/reference races fail safely.
- Preserve whole-document optimistic concurrency and existing Copy Unsaved
  conflict recovery. Do not add field-level merge or collaborative editing.
- Preserve all Phase 5 Script/direction behavior, stable IDs, ordering, and V1
  checkpoint semantics.
- Use shadcn primitives, cohesive server/client boundaries, and actively apply
  frontend-design, vercel-react-best-practices, and web-design-guidelines during
  implementation/review.

## Explicit non-goals

- Raw URLs in directions, multiple Assets per direction, Asset references on
  other direction types, auto-attachment, Content-owned media, automatic
  deletion, Content deletion, or a second association source of truth.
- Timeline, timing, trim/crop/edit/render behavior, drag-and-drop media tracks,
  collaboration, or AI/stock suggestions.
- New editor framework/state framework or Asset metadata embedded in JSONB.

## Acceptance criteria

- [ ] Only B-roll and sound cues expose the picker, with exactly the approved
      READY media compatibility and one-Asset cardinality.
- [ ] Picker authorization, pagination/search, preview, current selection, focus
      return, and responsive dialog/sheet behavior work in EN/FA and LTR/RTL.
- [ ] Picker upload/link creates a reusable Workspace Asset but never
      auto-attaches; failure leaves Content unchanged.
- [ ] Use/Replace/Detach produces canonical V3 local state, autosaves at the
      expected revision, and atomically synchronizes DRAFT projection rows.
- [ ] Foreign, non-READY, incompatible, stale, or DELETING Assets cannot be
      persisted even if the client previously displayed them.
- [ ] Attachment differences derive unaccepted changes; equivalent V2/V3
      documents without Asset changes remain accepted/equal.
- [ ] Acceptance atomically creates an immutable V3 Version and VERSION
      reference rows; later Draft or display-name changes do not alter its Asset
      identity.
- [ ] History/recovery is safe and human-readable and excludes IDs where
      required, source/storage/signed URLs, and raw JSON.
- [ ] Existing Phase 5 block/direction/autosave/conflict/acceptance/history
      behavior remains green.

## Focused tests

- **Unit/domain:** direction-specific attachment operations, equality,
  compatibility, recovery export, and unavailable-name presentation.
- **PostgreSQL integration:** authorized save/acceptance, READY/type/Workspace
  validation, projection atomicity, stale revision, delete/attach state races,
  immutable Version lineage, and preserved V1/V2 migration behavior.
- **Component:** picker filtering/search/pagination, lifecycle display, explicit
  Use/Replace/Detach, create-without-auto-attach, preview, focus return,
  conflicts, history/recovery, keyboard, EN/FA, RTL/LTR, and bidi names.
- **E2E:** none here; Ticket 10 owns the representative persisted editor journey.
