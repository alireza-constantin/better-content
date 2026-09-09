# Better Content — Current State

This is a concise derived map of the currently implemented Better Content
system. It exists to reduce agent context loading. It does not override the
PRD, Architecture, accepted ADRs, a current approved phase specification, or a
current ticket. If it conflicts with an authoritative source, correct this
document rather than following it.

## Product workflow

The current creator journey is:

```text
Workspace
  → Content DNA
  → Ideas
  → Production Queue
  → AI Content Generation
  → Structured Draft
  → Acceptance / immutable Version
  → Teleprompter
```

Publishing, Social Connections, and Analytics are not implemented. Automatic
Media Discovery is deferred; B-roll search queries do not call a search or
media-provider integration.

### Current product surfaces

- Dashboard is the authenticated starting surface for a workspace.
- Content DNA is the creator-profile input to idea generation.
- Ideas is the decision surface; batches remain available as provenance.
- Content contains the Production Queue, generated Content Library, structured
  editor, Version History, and Teleprompter entry point.
- Assets is a workspace media library and attachment source, not a general file
  manager or a media-discovery product.

## Stack and shape

- One Next.js modular-monolith application using TypeScript and Node/npm.
- PostgreSQL is the system of record; Drizzle ORM owns reviewed migrations.
- Better Auth provides authentication; Better Content owns product workspaces.
- shadcn/ui, `next-intl`, Zod, Vitest, Playwright, and deterministic provider
  seams support the UI, validation, and test stack.
- Application flow is UI → application service → domain/repository/provider
  adapter. React components do not own authorization, persistence, or provider
  behavior.

## Authentication and workspaces

- Better Auth authenticates users. V1 is a single personal Workspace model.
- A private operation establishes authenticated user, workspace membership, and
  resource ownership on the server; client-supplied identifiers are not
  authorization.
- Workspace-scoped reads and mutations are nondisclosing across workspaces.

## Internationalization

- The application supports English (`en`, LTR) and Persian (`fa`, RTL).
- UI locale is independent from creator-content language. Changing UI locale
  never translates, rewrites, or reverses creator content.
- Content surfaces preserve logical layout and mixed-direction text behavior.

## Content DNA

- Each workspace has one `content_dna` container with an immutable sequence of
  JSONB versions and a same-container current-version pointer.
- A successful meaningful save creates a complete immutable snapshot. Historical
  versions remain readable; current readiness is derived server-side rather than
  stored as a lifecycle field.
- Idea generation uses the exact current, AI-ready DNA version as lineage.

## Ideas and Idea Library

- An Idea belongs to an Idea Generation Batch, which records the source DNA
  version and one AI Run. Batches are provenance, not a separate primary UI.
- Each generation batch requests and persists exactly 20 canonical Ideas.
- Persisted Idea decision states are `NEW`, `SAVED`, `ACCEPTED`, and
  `REJECTED`; rejection retains the Idea and an optional reason.
- `USED` is derived from linked Content and is never persisted as an Idea state.
- The workspace-wide Idea Library supports the decision states and combines
  them with `All runs` or owned historical-run filtering.

## Production Queue

- The Content product includes a Production Queue and Generated Content Library.
- Queue membership is derived: an Idea is queued only when it is `ACCEPTED` and
  has zero linked Content records. It is not another Idea state or aggregate.
- Queue order is a nullable positive position on Idea. New eligible Ideas append;
  reordering is workspace-scoped, transactional, and detects stale submissions.

## AI architecture

- AI workflows use provider-neutral application contracts and runtime structured
  output validation. Deterministic fakes are the normal automated-test seam.
- Current new Idea and Content generation use AvalAI with `gpt-5.6-luna`.
  Historical AI Run metadata can retain prior supported provider/model pairs.
- `ai_runs` record provider/model/prompt/settings identity, lifecycle, safe
  usage, a safe provider correlation value, and canonical completed output.
- Raw prompts, raw provider envelopes, refusal text, and hidden reasoning are
  not retained as product data or exposed to clients.

### Generation safeguards

- Idea and Content generation are authorized against the active workspace and
  use idempotency, lifecycle, quota, and safe error boundaries.
- Inputs are validated before a provider call; structured provider output is
  treated as untrusted and is validated before persistence.
- Provider failures, timeouts, refusals, malformed output, and rate limits map
  to stable safe categories. A failed operation retains its durable attempt/run
  record where applicable and does not create partial successful artifacts.
- No hidden follow-up call, automatic provider retry, provider routing, or
  fallback changes the single-operation lineage.

## Content model

- Content is linked to its source Idea and successful Content Generation Attempt.
  The durable lineage is Idea → Attempt → AI Run → Content.
- A Content item has one mutable Draft with optimistic revision control and
  immutable Content Versions. Autosave conflicts preserve local work rather
  than silently overwriting another revision.
- `acceptedVersionId`, when present, references a `CREATOR_ACCEPTED` Version of
  the same Content. AI-generated and legacy-checkpoint versions cannot be the
  accepted pointer.
- The current canonical document is `ContentDocumentV4`: ordered stable-ID
  paragraph Script blocks with owned Performance and Edit Directions.
- V1, V2, and V3 documents are projected for reading/editing compatibility;
  historical immutable Versions and AI Run snapshots are not rewritten.

### Production Direction taxonomy

Performance Directions are `PAUSE`, `EMPHASIS`, `DELIVERY`, `GESTURE`,
`POSITION`, `GAZE`, and `PERFORMANCE_NOTE`.

Edit Directions are `TEXT_OVERLAY`, `ZOOM`, `CUT`, `BROLL_CUE`, `SOUND_CUE`,
`CAPTION_EMPHASIS`, and `EDIT_NOTE`. Directions remain anchored to their owning
Script block and follow the document's ordering and validation limits.

### B-roll search queries and Assets

- `BROLL_CUE.description` and optional `searchQuery` are distinct canonical
  Content fields. A creator can edit either; copying a query is presentation
  only and does not mutate the Draft or create a Version.
- AI-generated B-roll cues require a creator-language description and a
  distinct concise English search query. Queries are plain text, bounded, and
  cannot contain URLs or provider-result identities.
- AI never generates `assetId`. Creators may later attach an eligible Asset:
  `BROLL_CUE.assetId` accepts IMAGE or VIDEO; `SOUND_CUE.assetId` accepts AUDIO.
- There is no automatic media search, provider integration, import, preview, or
  attachment from a B-roll query.

## Current Content generation

One accepted Content generation operation performs one provider call. After
strict validation and trusted ID materialization, it creates one canonical V4
document containing the Script and contextually useful approved Directions.

```text
completed AI Run structured result
  = AI-generated immutable Version #1
  = initial mutable Draft
```

The operation preserves existing Attempt, AI Run, source-Idea, Content DNA, and
queue-exit lineage atomically. Invalid output creates no partial Content.

### Draft, Version, and acceptance behavior

- A meaningful accepted Draft becomes a new immutable `CREATOR_ACCEPTED`
  Version and advances the same-Content accepted pointer atomically.
- Continued Draft edits do not alter any accepted Version. Returning to an older
  document and accepting it is a new approval event, not mutation of history.
- Version History is read-only. It does not restore, edit, delete, branch, or
  relabel historical artifacts.
- Current presentation/read adapters project historical document versions
  without a read-triggered persistence migration.

## Teleprompter

- Teleprompter reads the current immutable accepted Version, never mutable Draft
  state. Missing or invalid accepted versions fail closed with a localized state.
- It projects Script blocks and Performance Directions for a read-only prompt.
- It provides accessible auto-scroll, playback/readability controls, mirror,
  fullscreen, Wake Lock when available, and EN/FA LTR/RTL behavior.
- It creates no `RecordingSession` and persists no recording, playback,
  scroll-position, mirror, speed, or text-size state.

## Assets

- Assets are workspace-owned immutable managed media: `IMAGE`, `VIDEO`, or
  `AUDIO`, acquired by `UPLOAD` or controlled `EXTERNAL_URL` ingestion.
- Lifecycle states are `PENDING`, `PROCESSING`, `READY`, `FAILED`, and
  `DELETING`. Only `READY` Assets are attachable or media-accessible.
- Production storage is private S3-compatible object storage behind a
  provider-neutral adapter; local development uses a filesystem adapter.
- Direct uploads and external ingestion are validated and inspected through the
  MediaInspector boundary before an Asset becomes `READY`.
- Private preview/download access uses temporary application-authorized
  capabilities. Permanent object URLs are not public product URLs.
- The Asset Library is workspace-scoped. Deletion is reference-safe and
  recoverable: immutable Version references prevent unsafe deletion.
- `asset_references` is a derived projection of Draft and Version document
  `assetId` values only. Search queries do not create Asset references.
- Reconciliation detects and safely repairs/alerts on storage and reference
  drift without weakening ownership or lifecycle rules.

### Asset workflow boundaries

- Upload finalization and external URL ingestion create durable processing work;
  browser-provided media type or metadata is not trusted as final inspection.
- Managed permanent objects are immutable once ready. Staging objects are
  temporary operational inputs, not creator-visible Asset identity.
- A delete request becomes recoverable cleanup when safe. Referenced Assets stay
  protected until no Draft or immutable Version reference requires them.
- External ingestion is a controlled, validated Asset pathway; it is not a
  general-purpose fetch proxy for arbitrary application requests.

## Jobs, security, and persistence

- PostgreSQL-backed jobs handle Asset processing, cleanup, and reconciliation;
  job lifecycle/idempotency is durable. External storage/network work is not
  held inside a database transaction.
- Server-side validation, secret isolation, private Asset access, and controlled
  Asset URL ingestion are mandatory boundaries. There is no arbitrary server
  URL fetch path and no public permanent Asset object URL.
- PostgreSQL JSONB stores structured Content documents. Production schema
  changes use reviewed, committed Drizzle migrations; historical migrations and
  historical document artifacts are not rewritten.

## Testing and deployment

- Unit/component tests cover deterministic domain and UI behavior; PostgreSQL
  integration tests cover persistence, authorization, transactions, constraints,
  and concurrency. Playwright is reserved for representative user journeys.
- Normal automated tests use deterministic AI/storage seams. Live provider or
  storage checks are explicit opt-in operational validation.

## Current status and roadmap

Completed: Phases 1–6, Phase 5 Extension 08 (Teleprompter), and Phase 5
Extension 09 (AI Production Directions and B-roll Search Queries).

Not implemented: Automatic Media Discovery, Phase 7 Publishing, Phase 8 Social
Connections, and Phase 9 Analytics. No implementation phase is currently
approved or active.

## Navigation

- [PRD](PRD.md) and [Architecture](ARCHITECTURE.md) remain authoritative.
- [ADR index](adr/README.md) identifies relevant durable decisions.
- [Phase index](phases/README.md) links preferred completed-phase summaries and
  historical full specifications.
