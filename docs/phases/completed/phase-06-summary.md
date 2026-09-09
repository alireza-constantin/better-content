# Phase 6 — Assets

**Status:** Complete

This is a derived completed-phase summary. It does not override the PRD,
Architecture, accepted ADRs, or a current approved phase specification.

## Delivered

- Workspace Asset Library for managed IMAGE, VIDEO, and AUDIO media.
- Direct upload and controlled external-URL ingestion, validation/inspection,
  private preview/download, and editor attachment.
- Storage lifecycle jobs, reference-safe deletion, and reconciliation.

## Enduring contracts

- Assets are workspace-owned immutable managed media with `UPLOAD` or
  `EXTERNAL_URL` origin and lifecycle `PENDING`, `PROCESSING`, `READY`,
  `FAILED`, or `DELETING`. Only `READY` Assets are attachable/accessible.
- Production storage is private S3-compatible storage behind a provider-neutral
  adapter; local development uses filesystem storage. Permanent object URLs are
  never public product URLs.
- Media is validated through the MediaInspector boundary before `READY`.
- Asset references are a derived projection of Draft/Version `assetId` values;
  immutable Version references prevent unsafe deletion. V4 search queries never
  create Asset references.
- B-roll accepts IMAGE/VIDEO attachments; Sound cues accept AUDIO. V4 preserves
  the existing Asset compatibility and does not rewrite historical documents.

## Persistence/schema introduced

- Assets, Asset Jobs, and `asset_references`, with workspace-scoped lifecycle,
  job, reference, and deletion-integrity constraints.

## Deferred / excluded

- Public permanent media URLs, media search/providers, automatic import,
  transcoding, deduplication, quotas, and generated media remain out of scope.

## Historical references

- [Full Phase 6 specification](../phase-06-assets.md)
- [ADR-018](../../adr/ADR-018-workspace-assets-lifecycle-and-content-lineage.md)
  and [ADR-019](../../adr/ADR-019-private-managed-media-storage-ingestion-and-access.md)
- [Phase 6 tracker](../../../.scratch/phase-06-assets/issues/)
