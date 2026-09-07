# Better Content Domain Language

Canonical product terms for the Better Content domain. This glossary is supplementary and does not override the PRD, architecture, accepted ADRs, or approved phase specifications.

## Assets

**Asset**:
A reusable, previewable media object owned directly by exactly one Workspace, with exactly one intrinsic media category: `IMAGE`, `VIDEO`, or `AUDIO` and one source type: `UPLOAD` or `EXTERNAL_URL`. Once ready, its managed media identity is immutable; an Asset may exist without Content references and may be referenced by multiple Contents or Production Directions in its owning Workspace.
_Avoid_: file, document, attachment, B-roll asset type, sound-effect asset type

**Managed media**:
The private, application-controlled object that gives a `READY` Asset its immutable byte identity. Managed media lives behind the provider-neutral storage boundary; storage keys and temporary access URLs are not Content data.
_Avoid_: public media URL, provider-owned Asset identity

**External URL Asset**:
An Asset whose immutable managed media was ingested from a creator-supplied direct HTTPS media URL. The URL is immutable PostgreSQL provenance and an acquisition source, not the live media location used by Production Directions or previews.
_Avoid_: hotlinked Asset, arbitrary web URL

**Asset reference**:
A reference inside an eligible Production Direction identifying the workspace Asset selected to fulfill that instruction. It is canonical Content document state, not an independently editable association entity.
_Avoid_: authoritative attachment row, Content-owned Asset

**Asset reference projection**:
The rebuildable relational `asset_references` index derived transactionally from canonical V3 Drafts and Versions. It supports reference integrity, deletion checks, and usage queries but never overrides a Content document.
_Avoid_: attachment source of truth, independently editable link

**Asset lifecycle**:
The one-way creator-media workflow `PENDING → PROCESSING → READY | FAILED`, with the separate irreversible `DELETING` cleanup state. Only `READY` Assets are attachable or previewable; `FAILED` is terminal for creator workflows.
_Avoid_: queued Asset state, retryable FAILED Asset

## Structured Content

**ContentDocumentV3**:
The schema-versioned structured Content document whose eligible Production Directions may contain Asset references. It succeeds V2 for mutable Content while preserving every historical V1 and V2 artifact unchanged.
_Avoid_: silently extended ContentDocumentV2
