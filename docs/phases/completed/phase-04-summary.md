# Phase 4 — Script Generation and Draft Editing

**Status:** Complete

This is a derived completed-phase summary. It does not override the PRD,
Architecture, accepted ADRs, or a current approved phase specification.

## Delivered

- Generation of Content from accepted Ideas, with a Production Queue and
  Generated Content Library.
- Content Generation Attempts, content-generation AI Runs, retry/idempotency,
  quota, and safe failure behavior.
- Mutable Draft editing with autosave and optimistic concurrency, plus immutable
  generated Version lineage.

## Enduring contracts

- Queue membership is derived from `ACCEPTED` plus zero linked Content; queue
  order is persisted on Idea and changed transactionally.
- Successful generation preserves Idea → Attempt → AI Run → Content lineage.
  Provider execution is outside the database transaction; completion is atomic.
- A Content item has one mutable Draft and immutable Versions. Draft conflicts
  preserve unsaved local work instead of overwriting another revision.
- Later phases superseded the original Script-only generated-document format;
  current Content generation and document compatibility are described in
  [CURRENT_STATE](../../CURRENT_STATE.md).

## Persistence/schema introduced

- Content, Draft, Version, and Content Generation Attempt persistence and their
  same-workspace lineage/integrity constraints.

## Deferred / excluded

- Structured directions, accepted-version behavior, Assets, and current V4
  generation were completed by later Phase 5/6 work.

## Historical references

- [Full Phase 4 specification](../phase-04-script-generation-and-draft-editing.md)
- [ADR-016](../../adr/ADR-016-content-script-generation-ai-policy.md) and
  [ADR-017](../../adr/ADR-017-production-queue-ordering.md)
- [Phase 4 tracker](../../../.scratch/phase-04-script-generation-and-draft-editing/issues/)
