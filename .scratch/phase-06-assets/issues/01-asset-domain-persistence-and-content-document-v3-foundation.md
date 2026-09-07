# 01: Establish the Asset domain, persistence, and ContentDocumentV3 foundation

**What to build:** Give Better Content a validated, Workspace-owned Asset
aggregate and a canonical V3 Content document that can retain typed Asset
identity without rewriting historical Content.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Scope

- Add the Asset aggregate and additive PostgreSQL/Drizzle persistence for the
  approved identity, ownership, classification, lifecycle, creator metadata,
  source-specific provenance, storage lifecycle, READY metadata, stable failure
  code, and timestamps.
- Add strict ContentDocumentV3 contracts that preserve V2 structure and permit
  one optional `assetId` only on `BROLL_CUE` and `SOUND_CUE`.
- Add deterministic V2→V3 projection, V2/V3 semantic comparison, V1/V2/V3
  parsing, and the existing V1 checkpoint-aware migration path.
- Add the derived `asset_references` persistence model, transactional projection
  replacement/insertion seams, usage-count query, and bounded rebuild service.
- Establish cohesive Asset repository/application boundaries for later
  lifecycle, ingestion, access, Library, picker, and deletion tickets.

## Architecture and documentation references

- Phase 6 specification ``1–8, 19, 20, 22, 23, and acceptance criteria 1–13.
- ADR-018 in full.
- ADR-003 Phase 6 Asset-bearing Content lineage clarification.
- ADR-004 Phase 6 V3/lazy-projection resolution.
- ADR-002 Workspace ownership; ADR-012 reviewed Drizzle migrations.
- PRD `23; Architecture ``6, 35–40.
- AGENTS rules for Workspace ownership, JSONB schema evolution, transactions,
  historical traceability, validation, migrations, and module boundaries.

## Expected behavior

- Every Asset belongs to exactly one Workspace and has exactly one immutable
  media type (`IMAGE | VIDEO | AUDIO`), source type
  (`UPLOAD | EXTERNAL_URL`), and current lifecycle value
  (`PENDING | PROCESSING | READY | FAILED | DELETING`).
- Closed values use repository-consistent text/check constraints rather than
  PostgreSQL enums. Source-specific and status-specific metadata cannot form
  invalid combinations.
- V3 preserves every V2 block, direction, ID, order, text, payload, limit, and
  canonicalization rule. Only `BROLL_CUE.assetId?` and
  `SOUND_CUE.assetId?` are accepted; all other directions strictly reject the
  field and attachment cardinality remains zero-or-one.
- Reading V1 or V2 yields an in-memory V3 editor projection without writing,
  advancing revision, creating a checkpoint/Version/reference row, or reporting
  a dirty Draft.
- An untouched V2 document compares equal to its deterministic V3 projection.
  V1 retains its special Phase 5 checkpoint semantics and is not generally
  declared equal to V2/V3.
- A meaningful V3 Draft save atomically advances the Draft revision and replaces
  its DRAFT projection. Acceptance atomically inserts the immutable V3 Version,
  inserts its VERSION projection, and moves the accepted pointer through the
  existing lifecycle.
- Projection rows record Workspace, Asset, Content, artifact kind, optional
  Version, and stable direction ID. They are query/rebuild state, never
  attachment authority.
- Unknown document versions and invalid stored documents fail through the
  established safe application error boundary.

## Implementation constraints and invariants

- ContentDocumentV3 is authoritative. Do not add independently editable
  ContentAsset, VersionAsset, accepted-Asset, or relational direction state.
- Reinforce same-Workspace ownership and Draft/Version projection shape with the
  strongest practical composite foreign keys, checks, uniqueness, and delete
  restrictions.
- Before persisting a referenced V3 document, the application must validate
  Asset existence, authorization, same Workspace, READY state, media
  compatibility, and cardinality. Later storage behavior is not required to
  create test READY records.
- Preserve every historical V1/V2 Version and AI Run output byte-for-byte.
  Existing V1 first-mutation/acceptance checkpoint behavior remains one-time and
  atomic, including direct V1→V3 persistence without an intermediate stored V2.
- New AI generation continues to preserve V1 output/Version #1 while the mutable
  Draft is materialized directly as V3.
- A stale V2 client may write only during the approved compatibility window and
  only against an authoritative V1/V2 Draft at the exact revision; it can never
  downgrade V3.
- Do not scatter Drizzle access into presentation components. Keep UI →
  application service → domain/repository boundaries.

## Explicit non-goals

- Object storage, upload/link ingestion, jobs, MediaInspector, private read
  capabilities, Asset UI, editor picker UI, or deletion jobs.
- Rewriting historical JSON, converting Versions in place, or changing Phase 5
  taxonomy/anchoring.
- Specialized Asset types, source types beyond the approved two, checksums,
  deduplication, shared blobs, quotas, folders, tags, Content deletion, or
  publication-specific Asset rows.

## Acceptance criteria

- [ ] The additive reviewed migration creates valid Asset/reference persistence
      and preserves all existing Content, Draft, Version, AI Run, accepted
      pointer, and Phase 5 relational integrity.
- [ ] Domain/runtime validation accepts only approved media/source/lifecycle
      values and valid conditional metadata combinations.
- [ ] V3 accepts exactly one optional compatible-position Asset ID on B-roll or
      sound cues and rejects unknown fields, arrays, and Asset IDs elsewhere.
- [ ] Pure V2→V3 projection preserves all V2 meaning and does not mutate its
      input; V2 and untouched V3 compare semantically equal.
- [ ] V1/V2 reads have no persistence side effects; unknown schema versions fail
      safely.
- [ ] Meaningful Draft save and Version acceptance update canonical JSON and the
      derived projection in the same PostgreSQL transaction.
- [ ] Projection constraints reject cross-Workspace, malformed DRAFT/VERSION,
      wrong-Content Version, duplicate direction, and destructive Asset-delete
      relationships.
- [ ] Rebuild derives rows only from surviving V3 artifacts, is idempotent, and
      restores intentionally corrupted/missing projection state without changing
      documents.
- [ ] V1 checkpoint, V1/V2 immutable history, accepted pointer, generation
      lineage, and stale-write behavior remain correct.

## Focused tests

- **Unit/domain:** V3 strict schema, V2 projection, V2/V3 equality, canonical
  parsing, invalid/unknown versions, conditional Asset metadata, and projection
  extraction.
- **PostgreSQL integration:** additive migration, Workspace/composite
  constraints, Draft/Version projection atomicity, rollback on invalid
  references, rebuild idempotency, V1 checkpoint preservation, direct V1→V3,
  V2 compatibility-window writes, and stale/downgrade conflicts.
- **E2E:** none; browser journeys belong to Ticket 10.
