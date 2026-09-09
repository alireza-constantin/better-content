# Phase 2 — Content DNA

**Status:** Complete

This is a derived completed-phase summary. It does not override the PRD,
Architecture, accepted ADRs, or a current approved phase specification.

## Delivered

- A workspace-owned Content DNA editor with localized editing and read-only
  version history.
- Server-side payload validation, normalization, derived readiness, and
  optimistic save behavior.

## Enduring contracts

- Each workspace has one Content DNA container and immutable complete JSONB
  snapshots; a current-version pointer must reference the same container.
- Storage-valid incomplete snapshots remain valid history. AI readiness is a
  canonical server-derived predicate, not a persisted status.
- Future generation records the exact immutable DNA version it used.
- Reads and writes enforce workspace authorization; historical versions are
  read-only and are never silently transformed.

## Persistence/schema introduced

- `content_dna` and `content_dna_versions`, including per-container version
  numbering and the same-container current-version integrity constraint.

## Deferred / excluded

- DNA does not itself invoke an AI provider or generate Ideas. Later phases
  consume its AI-ready current version.

## Historical references

- [Full Phase 2 specification](../phase-02-content-dna.md)
- [ADR-003](../../adr/ADR-003-versioning-strategy.md) and
  [ADR-013](../../adr/ADR-013-content-dna-version-storage.md)
- [Phase 2 tracker](../../../.scratch/phase-02-content-dna/issues/)
