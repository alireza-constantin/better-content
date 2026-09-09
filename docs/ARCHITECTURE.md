# Better Content

## Technical Architecture

**Status:** Accepted current architecture

This document defines current system architecture and cross-cutting technical
invariants. Product behavior is authoritative in the [PRD](PRD.md); durable
scoped decisions are authoritative in [ADRs](adr/README.md). Completed phase
specifications preserve execution detail and do not replace this architecture.

## 1. System shape

Better Content is one modular-monolith Next.js application. It uses TypeScript,
PostgreSQL as system of record, Drizzle ORM, Better Auth, `next-intl`, and
PostgreSQL-backed jobs. It does not use microservices, a separate backend,
Redis, Kafka, vector storage, or a separate analytics service.

The application boundary is explicit:

```text
UI → application service → domain / repository / provider adapter
```

React components own presentation and local interaction state. Server/application
layers own authorization, workflows, persistence, and external-provider calls.
See [ADR-001](adr/ADR-001-modular-monolith.md).

## 2. Module boundaries

| Module | Current responsibility |
| --- | --- |
| Workspace | Workspace ownership, membership, and private-resource authorization. |
| DNA | Content DNA payloads, immutable versions, readiness, and current pointer. |
| Ideas | Idea generation, batches, decisions, Library, and Production Queue reads. |
| AI | Provider-neutral contracts, provider adapters, structured outputs, and AI Runs. |
| Content | Generation attempts, Content, Drafts, Versions, editor, acceptance, and Teleprompter projections. |
| Assets | Asset lifecycle, storage/inspection adapters, Asset Library, references, and cleanup. |
| Jobs | PostgreSQL-backed durable work claiming, leases, retries, and execution. |
| Publishing | Future boundary for plans and external publications; no implementation yet. |
| Integrations | Future social-provider boundary; no implementation yet. |
| Analytics | Future publication analytics boundary; no implementation yet. |

Modules depend inward through domain/application contracts. Provider-specific,
database, or storage details do not leak into unrelated presentation modules.

## 3. Authentication and Workspace authorization

Better Auth authenticates users. Better Content owns workspaces and membership;
authentication alone never authorizes a private product record.

Every private operation establishes authenticated user, workspace membership,
and resource ownership on the server. Foreign-workspace and unauthorized
resource behavior is nondisclosing. V1 has a single personal Workspace model.
See [ADR-002](adr/ADR-002-authentication-and-workspaces.md).

## 4. Locale architecture

`next-intl` provides English and Persian locale routing and UI messages. English
is LTR; Persian is RTL. UI locale is independent from Content language, so
creator data follows its actual language/direction and is never transformed by
a UI locale change. CSS and components use logical direction behavior and
preserve mixed-direction text. See [ADR-010](adr/ADR-010-internationalization.md).

## 5. Persistence and transactions

PostgreSQL is the system of record. Drizzle access is kept in domain-level
repository/query functions. Important ownership, lineage, uniqueness, and
lifecycle invariants use database constraints where practical.

Production schema changes use reviewed, committed Drizzle migrations. Historical
migrations are not rewritten. Operations requiring consistency use short
transactions; external provider, storage, or network I/O never remains open
inside a database transaction. See [ADR-012](adr/ADR-012-drizzle-migrations.md).

JSONB is used for document-shaped Content and DNA payloads. Schema-versioned
parsers/projectors retain historical readability without rewriting immutable
artifacts merely because they are read.

## 6. Current data lineage

```text
Content DNA Version
  → Idea Generation Batch
  → Idea
  → Content Generation Attempt
  → AI Run
  → Content
  → mutable Draft / immutable Content Versions
  → future Publication
  → future Analytics snapshots
```

Generation batches retain the exact DNA version used. A successful Content
generation attempt is the durable source of its Content lineage. Future
publication and analytics must reference immutable accepted/published artifacts
rather than mutable Draft state.

## 7. Content DNA architecture

Each Workspace has one `content_dna` container with immutable version rows and a
same-container current-version pointer. A valid incomplete payload may be
stored; AI readiness is a canonical server-derived predicate. Historical
versions remain read-only and generation stores the exact version consumed.

The current pointer and version numbering are persistence invariants, not UI
conventions. See [ADR-003](adr/ADR-003-versioning-strategy.md) and
[ADR-013](adr/ADR-013-content-dna-version-storage.md).

## 8. Ideas and Production Queue

An Idea belongs to a generation batch and has one of `NEW`, `SAVED`, `ACCEPTED`,
or `REJECTED`. `USED` is derived from linked Content rather than stored. The
Library is workspace-wide; batch/run data supplies provenance and filtering.

Idea generation batches persist exactly 20 Ideas with lifecycle, idempotency,
quota, and workspace constraints. An Idea's queue membership is derived from
`ACCEPTED` plus zero linked Content. Queue order is a nullable positive position
on Idea, updated transactionally with stale-set conflict handling. No separate
queue aggregate or Idea `USED` status is introduced. See
[ADR-005](adr/ADR-005-derived-workflow-states.md) and
[ADR-017](adr/ADR-017-production-queue-ordering.md).

## 9. AI boundary and AI Runs

AI providers sit behind provider-neutral application contracts that expose
Better Content's needs rather than a vendor SDK. Provider adapters validate
external responses at the boundary and map failures to stable safe categories.
Normal automated tests use deterministic provider adapters.

New Idea and Content generation use AvalAI with `gpt-5.6-luna`; historical AI
Run records may retain previously supported provider/model metadata. Provider
selection, model policy, privacy, timeout, usage, and workflow policy are
governed by [ADR-011](adr/ADR-011-ai-provider-boundary.md),
[ADR-014](adr/ADR-014-initial-ai-provider-and-model-for-idea-generation.md),
[ADR-015](adr/ADR-015-avalai-initial-ai-provider.md), and
[ADR-016](adr/ADR-016-content-script-generation-ai-policy.md).

An AI Run records its generation kind, provider/model/prompt/settings identity,
lifecycle, safe usage, safe correlation, and canonical completed output. Raw
prompts, provider envelopes, refusal text, and hidden reasoning are not stored
as product data or exposed to clients.

## 10. Content generation architecture

Content generation accepts an authorized eligible Idea, reserves the applicable
operation, invokes one provider call outside the transaction, validates the
result, then atomically persists Content artifacts. Idempotent replay returns
the established operation rather than invoking another provider call.

Current generation uses one strict V4 structured result. Trusted application
code validates it and materializes persistent block/direction identifiers; the
provider does not control persistent IDs, Asset IDs, media URLs, or provider
result identities.

On success, the same canonical `ContentDocumentV4` value is retained as the
completed AI Run output snapshot, immutable `AI_GENERATED` Version #1, and
initial mutable Draft. Any validation or persistence failure creates no partial
Content and does not perform queue exit. Retry and Generate Another reuse this
same operation boundary.

## 11. Content aggregate and document compatibility

A Content aggregate is workspace-owned and linked to source Idea and successful
generation attempt. It has one mutable Draft, immutable Content Versions, and
an optional `acceptedVersionId`.

Draft writes use optimistic revision control. A conflict preserves local work;
the server does not silently merge or overwrite a concurrent Draft. Versions are
immutable snapshots. `acceptedVersionId`, if present, references a
`CREATOR_ACCEPTED` Version of the same Content; generated and legacy-checkpoint
versions cannot be accepted pointers.

The current document is `ContentDocumentV4`: ordered stable-ID paragraph blocks
with ordered stable-ID Performance and Edit Directions. Historical V1, V2, and
V3 documents are accepted by current read/projection compatibility. Reading,
previewing, history, or Teleprompter projection does not rewrite a historical
Version, AI Run snapshot, or Draft without a meaningful write.

This architecture follows [ADR-003](adr/ADR-003-versioning-strategy.md) and
[ADR-004](adr/ADR-004-structured-content-storage.md).

## 12. Production Directions and B-roll queries

Performance Directions are `PAUSE`, `EMPHASIS`, `DELIVERY`, `GESTURE`,
`POSITION`, `GAZE`, and `PERFORMANCE_NOTE`. Edit Directions are `TEXT_OVERLAY`,
`ZOOM`, `CUT`, `BROLL_CUE`, `SOUND_CUE`, `CAPTION_EMPHASIS`, and `EDIT_NOTE`.
They are owned by and anchored to one Script block; no range/timeline anchor is
introduced.

`BROLL_CUE.searchQuery` is optional canonical V4 Content data distinct from
description. Generated queries are concise English plain text and must not
contain URLs or provider identities. Creator edits participate in normal Draft,
revision, acceptance, and Version behavior; copying is presentation-only.

AI may never emit `assetId`. Creator attachment uses `BROLL_CUE.assetId` only
for IMAGE/VIDEO Assets and `SOUND_CUE.assetId` only for AUDIO Assets. A search
query creates no Asset relationship and no media-provider call.

## 13. Teleprompter projection

Teleprompter authorization resolves the current `acceptedVersionId` and validates
that it names a same-Content immutable `CREATOR_ACCEPTED` Version. It projects
the historical/current document to a safe read-only DTO containing Script blocks
and Performance Directions. It never uses a mutable Draft fallback.

Teleprompter browser controls are ephemeral UI state. No recording session,
playback state, scroll position, or UI preference is persisted by this feature.

## 14. Asset architecture

Assets are workspace-owned immutable managed media with `IMAGE`, `VIDEO`, or
`AUDIO` media type and `UPLOAD` or `EXTERNAL_URL` origin. Lifecycle is
`PENDING`, `PROCESSING`, `READY`, `FAILED`, or `DELETING`; only `READY` is
attachable or accessible.

`AssetStorage` is provider-neutral. Production uses private S3-compatible
storage; local development uses a filesystem implementation. Direct upload and
controlled external URL ingestion enter staged processing. MediaInspector
validates bytes and extracts trusted media information before promotion to
ready managed media.

Preview/download uses short-lived application-authorized capabilities. Permanent
objects have no public product URL. Controlled external ingestion is not an
arbitrary server fetch mechanism.

`asset_references` is a derived projection of `assetId` values in current Drafts
and immutable Versions. It records artifact ownership so referenced Assets are
not deleted unsafely. Search queries are never references. Deletion is a
recoverable lifecycle with storage/reference reconciliation and idempotent
cleanup. See [ADR-018](adr/ADR-018-workspace-assets-lifecycle-and-content-lineage.md)
and [ADR-019](adr/ADR-019-private-managed-media-storage-ingestion-and-access.md).

## 15. Jobs

PostgreSQL-backed jobs provide durable claiming, lease ownership, retries,
idempotency, and terminal state for asynchronous work. Current Asset processing,
cleanup, and reconciliation use this boundary. A worker may call storage or
inspect media outside its short persistence transitions; no separate queue
service is introduced. See [ADR-009](adr/ADR-009-postgresql-background-jobs.md).

## 16. Security boundaries

- Authorization is server-side and workspace-scoped for every private resource.
- Untrusted request/provider/media data is runtime-validated at the appropriate
  application boundary.
- Credentials, provider keys, and storage secrets remain server-side and are
  excluded from logs, client payloads, and persisted raw provider artifacts.
- Managed Assets are private; access is explicit and time-limited.
- External URL retrieval exists only in controlled Asset ingestion with URL,
  network, and media validation; no general arbitrary-fetch feature exists.

## 17. Testing and runtime topology

Unit/component tests prove pure/domain and presentation behavior. PostgreSQL
integration tests prove persistence, authorization, constraints, transactions,
and concurrency. Playwright covers representative cross-boundary journeys.
Live provider/storage checks are opt-in operational tests; normal tests use
deterministic seams.

The application and job worker require Node, PostgreSQL, server-only secrets,
private storage configuration where Assets are deployed, temporary processing
capacity, and observability. Detailed Asset deployment checks remain in the
Phase 6 deployment/closure documentation rather than this architecture.

## 18. Future boundaries

Publishing will model publication plans separately from external Publications;
future analytics belongs to Publications and historical snapshots. Social
providers remain behind capability-aware adapters and social credentials require
application-level encryption. These are boundaries, not implemented modules.

See [ADR-006](adr/ADR-006-publication-model.md),
[ADR-007](adr/ADR-007-social-provider-adapters.md), and
[ADR-008](adr/ADR-008-social-credential-encryption.md). Their future work does
not authorize Phase 7, Social Connections, or Analytics implementation.

## 19. Architecture navigation

- [PRD](PRD.md) is authoritative for product truth and future scope.
- [ADR index](adr/README.md) routes scoped architectural decisions.
- [Current State](CURRENT_STATE.md) is derived navigation, not authority.
- [Completed phase summaries](phases/README.md) preserve concise historical
  boundaries; full phase specifications retain execution detail.
