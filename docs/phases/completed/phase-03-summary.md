# Phase 3 — AI Foundation and Idea Generation

**Status:** Complete

This is a derived completed-phase summary. It does not override the PRD,
Architecture, accepted ADRs, or a current approved phase specification.

## Delivered

- Provider-neutral AI generation for creator-specific Ideas using current
  AI-ready Content DNA.
- Workspace-wide Idea Library, generation provenance, decision actions, and
  safe deterministic provider testing seams.
- AvalAI production integration and auditable AI Run/batch records.

## Enduring contracts

- Each batch creates exactly 20 canonical Ideas and records its DNA version and
  one AI Run. Batches are provenance, not a separate primary product surface.
- Idea states are `NEW`, `SAVED`, `ACCEPTED`, and `REJECTED`; `USED` is derived
  from linked Content rather than stored.
- The Library is workspace-wide and combines decision-state views with owned
  historical-run filtering.
- Provider-neutral contracts, runtime validation, safe metadata, no raw prompt
  or provider-envelope retention, and deterministic tests remain required.

## Persistence/schema introduced

- `ai_runs`, `idea_generation_batches`, `ideas`, and generation quota/rate
  control records with lifecycle, idempotency, and workspace constraints.

## Deferred / excluded

- Content generation is a later operation. The later Production Queue derives
  eligibility from accepted Ideas with no linked Content.

## Historical references

- [Full Phase 3 specification](../phase-03-idea-generation.md)
- [ADR-011](../../adr/ADR-011-ai-provider-boundary.md),
  [ADR-014](../../adr/ADR-014-initial-ai-provider-and-model-for-idea-generation.md), and
  [ADR-015](../../adr/ADR-015-avalai-initial-ai-provider.md)
- [Phase 3 tracker](../../../.scratch/phase-03-idea-generation/issues/)
