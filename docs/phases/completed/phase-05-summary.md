# Phase 5 — Structured Content Editor and Production Direction

**Status:** Complete, with completed post-completion extensions

This is a derived completed-phase summary. It does not override the PRD,
Architecture, accepted ADRs, or a current approved phase specification.

## Delivered

- A structured Script editor with stable paragraph blocks and block-local
  Performance and Edit Directions.
- Whole-document autosave, conflict recovery, immutable acceptance Versions,
  accepted-version history, and legacy document projections.

## Enduring contracts

- Current Content is `ContentDocumentV4`; V1/V2/V3 remain readable without
  rewriting historical Versions or AI Run snapshots.
- Drafts are mutable and revisioned; Versions are immutable. `acceptedVersionId`
  can reference only a same-Content `CREATOR_ACCEPTED` Version.
- Direction taxonomy and block anchoring are canonical. See
  [CURRENT_STATE](../../CURRENT_STATE.md) for current V4 taxonomy and limits.

## Persistence/schema introduced

- Structured JSONB document evolution, accepted-version pointer integrity, and
  immutable Version-history foundations.

## Extension 08 — Teleprompter

- Completed after original Phase 5 scope. It reads the current immutable
  accepted Version, projects Script and Performance Directions, and persists no
  recording or playback session state.

## Extension 09 — AI Production Directions and B-roll Search Queries

- Completed after original Phase 5 scope. New generation creates canonical V4
  output with contextually useful approved Directions and optional B-roll query.
- `BROLL_CUE.searchQuery` is creator-editable canonical Content data; copying is
  presentation-only. AI never generates an `assetId` or media URL.

## Deferred / excluded

- Automatic Media Discovery, provider search/import, timelines, collaboration,
  and Publishing remain outside this completed work.

## Historical references

- [Full Phase 5 specification](../phase-05-structured-content-editor-and-production-direction.md)
- [ADR-003](../../adr/ADR-003-versioning-strategy.md),
  [ADR-004](../../adr/ADR-004-structured-content-storage.md), and
  [ADR-016](../../adr/ADR-016-content-script-generation-ai-policy.md)
- [Phase 5 tracker](../../../.scratch/phase-05-structured-content-editor-and-production-direction/issues/)
