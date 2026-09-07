# ADR-018: Model Workspace Assets With Immutable Media and Content-Document Lineage

- **Status:** Accepted
- **Date:** 2026-09-07
- **Decision owners:** Product Architect / Technical Lead
- **Applies to:** Phase 6 Assets

## Context

Phase 5 made Production Directions structured instructions inside the canonical
Content document. Phase 6 must let creators manage real media and associate it
with relevant directions without turning Better Content into an editor,
timeline, general file drive, or full digital-asset-management system.

The design must preserve Workspace isolation, reusable media, immutable Content
Version history, and the accepted-version lifecycle. It must also avoid two
authoritative representations of which media fulfills a direction.

## Decision

### Asset identity, ownership, and type

An Asset is a Workspace-owned identity for one immutable managed media object.
It belongs to exactly one Workspace, may exist without a Content reference, and
may be reused by multiple Contents and Production Directions in that Workspace.
Cross-Workspace references are forbidden.

Phase 6 defines exactly:

```text
mediaType = IMAGE | VIDEO | AUDIO
sourceType = UPLOAD | EXTERNAL_URL
```

Both values are intrinsic, immutable properties. Media type describes the
managed bytes rather than their use. Source type describes the approved
creation path rather than storage identity. A successful creation attempt
always creates a distinct Asset and distinct permanent object; Asset identity
is `Asset.id`, not a checksum, URL, filename, ETag, or byte equality.

Once READY, the permanent bytes and storage key are immutable. Mutable
creator-facing metadata is limited to approved metadata such as display name.
There is no replace-in-place media operation.

### ContentDocumentV3 is authoritative

Asset attachment is part of canonical structured Content. `ContentDocumentV3`
extends the Phase 5 document so:

- `BROLL_CUE` may optionally reference exactly one READY IMAGE or VIDEO Asset;
- `SOUND_CUE` may optionally reference exactly one READY AUDIO Asset;
- all other Phase 6 direction types contain no Asset reference.

Directions reference `assetId` only. Raw URLs, storage keys, filenames,
provider data, or signed capabilities do not enter the Content document.

Attachment and detachment are Content mutations and participate in Draft
revision, whole-document autosave, optimistic concurrency, canonical equality,
recovery export, acceptance, accepted/unaccepted-change derivation, immutable
Version snapshots, and Version History.

No relational association may compete with the document as source of truth.
A transactionally synchronized `asset_references` relation may exist only as a
derived integrity/query projection. It cannot be edited independently and must
be rebuildable from canonical Draft and Version documents.

### Draft, Version, and acceptance lineage

Before a V3 Draft is persisted, every referenced Asset must exist, belong to
the Content Workspace, be READY, and be compatible with the direction and
cardinality rules.

An immutable V3 Content Version permanently records the selected Asset IDs.
Acceptance snapshots the current canonical V3 document and moves
`acceptedVersionId` according to ADR-003. Later Draft attachment changes do not
rewrite the accepted or historical Version. Every reference from a surviving
immutable V3 Version protects its Asset, whether or not that Version remains
accepted.

V2 Drafts are lazily projected to V3. The projection adds no references and is
semantically equal until a creator makes a meaningful V3 change or accepts.
Existing V1 checkpoint and immutable-history rules remain intact. Historical V1
and V2 Versions are never rewritten.

### Lifecycle and deletion

The Asset lifecycle is:

```text
PENDING → PROCESSING → READY
                     ↘ FAILED

eligible state → DELETING
```

READY is the only attachable state. FAILED is terminal for creator processing;
a new attempt creates a new Asset. DELETING is irreversible and never becomes
FAILED.

Creators explicitly delete eligible Assets. Deletion is forbidden while any
current Draft or surviving immutable V3 Version references the Asset.
Application locks and rechecks serialize attachment, acceptance, and deletion
races. Nothing detaches or rewrites Content automatically.

Zero-reference READY Assets remain in the Workspace library until explicit
deletion. Content deletion is outside Phase 6. Physical object cleanup and
metadata removal follow ADR-019.

## Consequences

### Positive

- Workspace media is reusable without giving Content ownership of its lifecycle.
- Historical Content Versions keep stable, auditable media identity.
- The canonical document remains the single authority for production intent.
- Future publishing can follow Content Version → Asset without rewriting history.
- The domain stays small and avoids speculative DAM taxonomy and provenance.

### Tradeoffs

- JSONB validation and a derived reference projection must be kept
  transactionally consistent.
- Asset deletion needs relational projection queries plus locking/rechecks.
- Historical Version references can retain Assets indefinitely.
- A breaking V2-to-V3 document evolution requires explicit projection and
  equality rules.

## Rejected alternatives

### Content-owned Assets

Rejected because media must be reusable across Contents and Content deletion
must not silently destroy shared or historical media.

### Authoritative relational attachment rows

Rejected because they would split the source of truth from the canonical
document and weaken portable immutable Version snapshots.

### Mutable or replaceable READY media

Rejected because replacing bytes would silently change what historical
Versions mean.

### Specialized Asset taxonomy

Rejected for V1. Logo, screenshot, thumbnail, B-roll, music, and sound-effect
labels describe use, not intrinsic media category.

### References on every Production Direction or multiple Assets per direction

Rejected as unsupported scope. Phase 6 has only the B-roll and sound-cue
relationships defined above.

## Invariants

- An Asset belongs to exactly one Workspace.
- A Content document references only READY Assets in the same Workspace.
- ContentDocumentV3 is authoritative; `asset_references` is derived.
- Every immutable V3 Version reference protects the referenced Asset.
- READY media identity and bytes never change.
- No deletion rewrites or silently detaches a Draft or Version.
- Asset identity is its ID; identical media may coexist.

## Relationship to existing ADRs

- ADR-002 remains authoritative for Workspace membership and isolation.
- ADR-003 is amended for Asset-bearing Draft and Version lineage.
- ADR-004 is amended for ContentDocumentV3 and lazy V2 projection.
- ADR-009 remains authoritative for PostgreSQL-backed lifecycle jobs.
- ADR-010 remains authoritative for EN/FA and RTL/LTR behavior.
- ADR-012 remains authoritative for reviewed Drizzle migrations.

## V1 boundaries

This ADR does not add documents/arbitrary files, folders, tags, collaboration,
Content deletion, timeline editing, rendering, transcoding, deduplication,
storage quotas, AI-generated media, stock media, hosted-media page imports, or
social-post imports.
