# Better Content — Phase 06: Assets

## 1. Status, prerequisites, and authority

- **Status:** Proposed — ready for Product Architect review
- **Decision owners:** Product Architect / Technical Lead
- **Prerequisite:** Phase 5 complete and approved
- **Required architecture work before implementation:** the ADR and documentation reconciliation in Section 28

This document is the authoritative Phase 6 implementation specification once approved. It does not itself create implementation tickets, migrations, dependencies, infrastructure, or code.

The source-of-truth order remains PRD, Architecture, accepted ADRs, this approved phase specification, `AGENTS.md`, and implementation. Phase 5's approved structured-editor specification and implemented Content lifecycle are prerequisites. `CONTEXT.md` is supplementary vocabulary only.

Implementation must stop and request Product Architect review if it discovers a conflict that would change Asset ownership, Content lineage, lifecycle, authorization, security, creator-facing behavior, or worker architecture. Ordinary implementation details may be resolved using the smallest production-quality approach consistent with this specification and established repository patterns.

## 2. Problem statement and solution

Phase 5 gives creators structured Content with Script blocks, Production Directions, mutable Drafts, immutable Versions, and an accepted Version pointer. Production Directions remain instructions only. A creator can describe required B-roll or sound, but Better Content cannot yet retain, preview, reuse, or associate the actual media needed to fulfill those instructions.

Phase 6 adds private, reusable, Workspace-owned Assets:

```text
Workspace Asset Library
├── creator-uploaded managed media
├── direct-HTTPS-ingested managed media
└── IMAGE | VIDEO | AUDIO preview and management

ContentDocumentV3
└── eligible Production Direction
    └── optional assetId
```

The Asset Library remains deliberately flat and lightweight. Content identifies which Asset fulfills a direction; the Asset aggregate identifies the immutable managed media. Files live in private provider-neutral storage, metadata remains in PostgreSQL, and slow media work runs through PostgreSQL-backed jobs outside normal HTTP request execution.

## 3. V1 scope and explicit non-goals

### V1 scope

Phase 6 includes:

- Workspace-owned Assets with intrinsic `IMAGE`, `VIDEO`, or `AUDIO` media type;
- `UPLOAD` and `EXTERNAL_URL` source types;
- private managed storage behind an S3-compatible `AssetStorage` boundary;
- ArvanCloud Object Storage as the initial managed provider configuration;
- filesystem storage for normal local development and a deterministic fake for tests;
- direct single-file staging PUT, asynchronous inspection, immutable promotion, and READY validation;
- secure ingestion of direct HTTPS media responses;
- Sharp-based image inspection and ffprobe-based audio/video inspection;
- a dedicated flat Asset Library;
- private image, video, and audio preview and download;
- optional Asset selection for B-roll and sound directions in `ContentDocumentV3`;
- immutable Version lineage and a derived relational Asset-reference projection;
- reference-safe asynchronous hard deletion;
- PostgreSQL jobs and a dedicated server-side runner;
- EN/FA, LTR/RTL, accessibility, security, reconciliation, and operational logging.

### Explicit non-goals

Phase 6 does not include:

- PDF, document, brief, shot-list, or arbitrary-file Assets;
- specialized Asset types such as logo, screenshot, thumbnail, B-roll, music, or sound effect;
- generated thumbnails, poster frames, waveforms, alternate renditions, or creator-facing derivatives;
- transcoding, format conversion, optimization, trimming, crop/reframe, filters, transitions, keyframes, audio mixing, timelines, tracks, or rendering;
- folders, tags, collections, favorites, ratings, comments, custom fields, bulk actions, custom sorting, or Trash;
- media collaboration, sharing, public links, Asset ACLs, or public CDN delivery;
- duplicate detection, checksums as identity, physical deduplication, or shared blobs;
- Workspace storage quotas, plan entitlements, usage meters, or billing;
- AI generation, AI suggestions, semantic matching, classification, stock media, marketplaces, licenses, or attribution workflows;
- YouTube/Vimeo pages, social posts, HTML extraction, oEmbed, Drive/Dropbox share pages, OAuth sources, cookies, or authenticated remote media;
- malware-scanning service, content moderation, copyright verification, or rights detection;
- Content deletion, automatic cleanup of valid zero-reference Assets, or Content-owned Asset lifecycle;
- WebSockets, SSE, Redis, message brokers, a second backend, or a separate media-processing service.

## 4. User stories

1. As a creator, I want to upload an image, video, or audio file, so that I can organize media needed for production.
2. As a creator, I want to provide a direct media link, so that Better Content can ingest media I am authorized to use.
3. As a creator, I want linked media copied into managed storage, so that later link rot or remote changes do not alter my Asset.
4. As a creator, I want Assets owned by my Workspace, so that I can reuse them across Contents.
5. As a creator, I want an Asset to remain useful without a Content attachment, so that I can prepare my library before writing directions.
6. As a creator, I want to see upload and processing progress, so that asynchronous media work is understandable.
7. As a creator, I want safe localized failure information, so that I know when to provide different media.
8. As a creator, I want to preview images visually, videos in a native player, and audio in a native player, so that I can choose the correct media.
9. As a creator, I want private downloads, so that I can retrieve my managed original without exposing it publicly.
10. As a creator, I want to rename an Asset without changing its media identity, so that the library remains understandable.
11. As a creator, I want to search by display name or upload filename, so that I can find reusable media.
12. As a creator, I want to filter by media type and lifecycle, so that the flat library remains manageable.
13. As a creator, I want to see how many Contents reference an Asset, so that deletion behavior is understandable.
14. As a creator, I want a B-roll direction to select one image or video, so that the instruction identifies actual production media.
15. As a creator, I want a sound direction to select one audio Asset, so that the instruction identifies actual sound media.
16. As a creator, I want to preview an Asset before selecting it, so that I avoid attaching the wrong media.
17. As a creator, I want to replace or detach a direction's Asset without deleting the Asset, so that direction editing and library lifecycle remain separate.
18. As a creator, I want editor-created media to appear in the Workspace library, so that it remains reusable.
19. As a creator, I want processing to finish before an Asset becomes selectable, so that Content never references unusable media.
20. As a creator, I want Asset attachment to participate in autosave and acceptance, so that accepted Versions record exact production media.
21. As a creator, I want historical Versions to retain their media meaning, so that later edits cannot silently change accepted artifacts.
22. As a creator, I want stale editor saves rejected, so that an older tab cannot remove a newer Asset selection.
23. As a creator, I want referenced Assets protected from deletion, so that Drafts and historical Versions are not corrupted.
24. As a creator, I want deletion to show “Deleting…” until physical cleanup succeeds, so that completion is not misrepresented.
25. As a creator, I want standalone Assets retained until I explicitly delete them, so that zero references do not imply garbage.
26. As a Persian-speaking creator, I want the Asset experience to work in FA/RTL while preserving English filenames, so that mixed-language media remains usable.
27. As an English-speaking creator, I want Persian Asset names to render safely and naturally, so that bidi text does not disrupt controls.
28. As a Workspace member, I want private Asset reads restricted to my Workspace, so that unpublished media is isolated.
29. As a Workspace owner, I want mutations authorized independently of client-provided IDs, so that cross-Workspace actions are impossible.
30. As an operator, I want media processing to be idempotent and retry-safe, so that worker crashes do not duplicate or corrupt permanent media.
31. As an operator, I want PostgreSQL to reserve permanent-object ownership before storage creation, so that orphan reconciliation is safe.
32. As an operator, I want bounded ingestion throughput and byte limits, so that one account cannot exhaust worker or storage capacity immediately.
33. As an operator, I want storage, processing, deletion, and reference anomalies observable without logging creator media or URLs, so that incidents can be repaired safely.
34. As an engineer, I want deterministic fake adapters and narrow provider contracts, so that normal CI does not depend on cloud storage or arbitrary internet hosts.
35. As an architect, I want V1/V2 history preserved while mutable work advances to V3, so that schema evolution does not rewrite lineage.

## 5. Asset domain model

### Aggregate and identity

An Asset is one reusable, previewable media object owned by exactly one Workspace. Asset identity is `Asset.id`, never filename, URL, provider ETag, checksum, or media bytes.

```text
Asset.mediaType  = IMAGE | VIDEO | AUDIO
Asset.sourceType = UPLOAD | EXTERNAL_URL
Asset.status     = PENDING | PROCESSING | READY | FAILED | DELETING
```

`mediaType` describes the stored media, not its use. Logos, screenshots, thumbnails, and still references are IMAGE; B-roll clips are VIDEO; music and sound effects are AUDIO. Usage belongs to the Production Direction relationship.

### Persisted metadata

Persist only fields required by ownership, lifecycle, validation, preview, provenance, or operations:

- identity and ownership: ID, Workspace ID, creator user ID;
- classification: media type, source type, lifecycle status;
- creator metadata: required display name;
- upload provenance: immutable original leaf filename and preliminary declared size/MIME where required by the upload protocol;
- external provenance: immutable normalized plaintext source URL and safe normalized source hostname;
- storage lifecycle: staging key and reserved permanent key where applicable;
- authoritative READY metadata: exact byte size, detected MIME, normalized media format, and required dimensions/duration/codecs;
- failure state: stable failure code;
- created and updated timestamps.

Use repository-consistent text columns plus reviewed checks for closed values rather than introducing PostgreSQL enum types. Use exact byte counts. Storage keys, source URL, and operational fields never enter Content documents or creator recovery output.

### Mutability

- READY managed bytes, permanent key, media type, source type, provenance, and authoritative technical metadata are immutable.
- `displayName` is mutable and does not change Content equality or create a Version.
- Replacing media creates a new Asset ID.
- No AssetVersion or shared-blob entity exists.
- Identical media may intentionally exist as separate Assets with separate storage objects and provenance.

### Stable failure codes

Use a small creator-safe set, localized at presentation time:

- `UPLOAD_EXPIRED`;
- `MEDIA_TOO_LARGE`;
- `MEDIA_LIMIT_EXCEEDED`;
- `MEDIA_TYPE_MISMATCH`;
- `UNSUPPORTED_MEDIA`;
- `INVALID_MEDIA`;
- `UNSAFE_MEDIA_URL`;
- `MEDIA_SOURCE_UNAVAILABLE`;
- `PROCESSING_UNAVAILABLE`.

Internal parser, HTTP, storage, and job errors map into these codes without being persisted as creator-facing strings. The specification does not require a one-code-per-parser-condition taxonomy.

## 6. ContentDocumentV3 schema changes

V3 preserves V2 block structure, limits, canonicalization, IDs, order, text, direction taxonomy, and direction payloads. It adds optional Asset identity only to two Edit Direction variants:

```text
BROLL_CUE
├── existing id, description, nuance
└── assetId?  // READY IMAGE or VIDEO in the same Workspace

SOUND_CUE
├── existing id, kind, description, nuance
└── assetId?  // READY AUDIO in the same Workspace
```

Every other Performance or Edit Direction strictly rejects `assetId`. Attachment cardinality is zero or one; no array or attachment wrapper is introduced. Existing description/kind/nuance requirements remain unchanged. Multiple media needs are modeled as multiple ordered directions.

`ContentDocumentV3` contains Asset IDs only. It excludes names, URLs, storage keys, MIME, dimensions, duration, codecs, provider data, and signed capabilities.

The V3 runtime schema remains strict. Before any V3 persistence, the application validates every referenced Asset for existence, current authorization, same Workspace, READY state, compatible media type, and cardinality.

## 7. Asset-reference projection

`asset_references` is a derived relational integrity/query projection. Canonical V3 Drafts and Versions remain authoritative.

Each row identifies conceptually:

- Workspace;
- Asset;
- Content;
- artifact kind `DRAFT | VERSION`;
- Version ID for VERSION rows only;
- stable direction ID.

The projection supports:

- reference-safe Asset deletion;
- efficient usage queries;
- same-Workspace foreign-key protection;
- deterministic rebuild/reconciliation.

Draft save, Draft revision advancement, and DRAFT projection replacement occur in one PostgreSQL transaction. Version creation and VERSION projection insertion occur in one transaction. Projection rows are never edited through an independent UI or service.

Use practical composite foreign keys/checks/uniqueness so that:

- Asset and Content belong to the recorded Workspace;
- a VERSION row's Version belongs to its Content;
- DRAFT rows have no Version ID and VERSION rows require one;
- one direction within one artifact cannot reference multiple Assets;
- Asset deletion is restricted while any row exists.

If projection and document disagree, the document wins. Provide a bounded operational reconciliation/rebuild service that reads surviving V3 artifacts and repairs projection state transactionally. V1/V2 artifacts produce no rows.

The Library usage indicator is `COUNT(DISTINCT contentId)` across surviving Draft and Version projection rows. It is derived, never persisted.

## 8. Draft, Version, and acceptance semantics

Attachment, replacement, and detachment are ordinary whole-document V3 Draft mutations. They participate in local editor state, debounced serialized autosave, revision checks, canonical equality, conflict recovery, acceptance, and Version History.

An accepted Version permanently records the Asset IDs selected at acceptance. Editing the Draft afterward leaves `acceptedVersionId` unchanged and derives unaccepted changes normally. Re-acceptance creates a new immutable V3 Version only when document semantics differ.

Every surviving immutable V3 Version protects every referenced Asset, including non-current and non-accepted historical Versions. Future Publication continues to reference an exact Content Version and obtains its Asset set from that Version; Phase 6 adds no PublicationAsset, ContentAsset, accepted-Asset, or Asset analytics table.

Asset display-name changes do not change document equality. Historical views may show the current display name because historical identity is Asset ID plus immutable managed media.

Creator-facing recovery copy remains deterministic, human-readable, ID-free, and non-importable. For attached Assets it includes a resolvable display name and media category; unavailable local selections use a localized unavailable marker. It never includes Asset, direction, or block IDs; storage/source/signed URLs; or raw JSON.

## 9. Asset lifecycle

### PENDING

The Asset record exists but no authoritative permanent media exists. For uploads, PENDING covers waiting for the staging PUT, waiting for Finalize, and an accepted Finalize awaiting a job claim. For external URLs, it covers a queued ingestion job.

PENDING is visible in lifecycle-aware management UI but not attachable or previewable. No separate Asset QUEUED status exists.

### PROCESSING

A PostgreSQL job owns the active attempt. Processing may retrieve remote bytes, validate staging, reserve a permanent key, promote, re-read/inspect permanent media, extract metadata, and clean staging. Internal worker steps do not become Asset statuses.

### READY

READY requires:

- one immutable permanent managed object;
- successful permanent-object validation;
- approved format/codec and all size/dimension/duration limits;
- required technical metadata;
- expected browser previewability.

READY is the only attachable and media-accessible status.

### FAILED

Deterministic validation/security failures fail immediately. Transient infrastructure failures retry through ADR-009's bounded mechanism. Exhaustion transitions PROCESSING to FAILED with a stable safe failure code.

FAILED is terminal for creator workflows. There is no FAILED→PENDING retry, source replacement, or job reset. A new creator attempt creates a new Asset. FAILED metadata remains until explicit deletion.

### DELETING

DELETING is an irreversible, non-attachable cleanup state. It cannot be renamed, previewed through a new capability, downloaded through a new capability, restarted, or cancelled. Cleanup failure never turns it into FAILED.

## 10. Upload workflow

### Begin

The owner supplies one file, media type, display name, original leaf filename, browser-reported exact size, and preliminary MIME. Server validation rejects invalid names, missing/invalid leaf filenames, non-positive/oversized files, unsupported extensions, and meaningful MIME/extension disagreement before creating storage authority.

Empty or generic browser MIME may remain a weak hint; any meaningful declared MIME must be compatible with the chosen type and later detected media. Server-side detected bytes remain authoritative.

After authorization and ingestion-admission checks, Begin creates one UPLOAD/PENDING Asset with an opaque staging key and returns a four-hour presigned PUT capability for exactly that staging object. The capability cannot list, read, delete, promote, or address another key.

V1 uses one PUT. There is no multipart upload, byte-range continuation, or pause/resume. An interrupted transfer restarts from byte zero. While the Asset remains unfinalized PENDING and inside its 24-hour upload session, the owner may request a fresh four-hour PUT capability for the same staging key.

The provider contract should bind exact Content-Length where supported. Finalization and processing always verify actual object size independently. ETags may support conditional storage operations but are never identity, a portable checksum, or deduplication input.

### Finalize

Finalize reauthorizes, locks/reloads the Asset, verifies the unexpired unfinalized state, HEADs the staging object, verifies exact stored length against the declared value and media limit, records one logical Finalize transition, and atomically enqueues one processing job. It returns promptly.

Repeated/concurrent Finalize requests converge on the same workflow. Finalize never processes media synchronously. New PUT capabilities cannot be issued after Finalize wins.

Promotion must consume a complete staging-object observation. The permanent object is independently re-read and inspected before READY, so a racing or later staging overwrite cannot change READY media. If the provider cannot support the required complete-object PUT/copy semantics, implementation stops for architecture review.

### Upload admission defaults

Use PostgreSQL-backed race-safe admission:

- 30 accepted Asset creations per authenticated user per rolling hour;
- 60 per Workspace per rolling hour;
- five active PENDING/PROCESSING ingestion workflows per Workspace.

Only an accepted Asset creation consumes a rolling event. Capability refresh and idempotent Finalize do not. Denial creates no Asset/staging key and returns localized `RATE_LIMITED` guidance. These are throughput controls, not storage quotas.

## 11. External URL ingestion and SSRF boundary

An EXTERNAL_URL Asset accepts one normalized direct HTTPS media URL of at most 4,096 UTF-8 bytes. The creator declares IMAGE, VIDEO, or AUDIO; inspection must confirm it rather than silently changing it.

Persist the normalized fragment-free `sourceUrl` as ordinary plaintext PostgreSQL application data and persist a lowercase ASCII/punycode `sourceHost` without path, query, credentials, or port. Both are immutable. The full URL is absent from Content, Versions, reference rows, jobs, recovery output, analytics, logs, errors, and ordinary list UI. Phase 6 has no full-URL reveal/open action.

Only absolute HTTPS on the standard port is supported. Reject userinfo, custom request headers, cookies, OAuth, HTTP authentication, browser sessions, non-HTTPS schemes, and interactive login. The final response must be actual media, not HTML or a hosting/share page.

The worker performs manual redirect handling with at most three redirects. For the initial target and every redirect it:

- parses and validates the URL again;
- forbids HTTPS→HTTP downgrade;
- resolves the hostname through the controlled network layer;
- rejects loopback, private, link-local, carrier-grade NAT, multicast, unspecified, reserved/non-routable, documentation/test, metadata-service, and IPv4-mapped prohibited IPv6 destinations;
- rejects a hostname resolving to any prohibited destination;
- binds the actual connection to an approved public resolution to prevent DNS rebinding;
- preserves correct TLS hostname verification;
- forwards no cookies, Authorization, or creator/application credentials.

Use bounded DNS/connect/header/idle/total timeouts, bounded response headers, trustworthy Content-Length early rejection, and an authoritative streamed-byte ceiling. Do not buffer arbitrary remote responses in memory. The controlled fetch implementation must disable automatic redirects and be security-reviewed; plain `fetch(userUrl)` is insufficient.

Remote media streams to private staging and then enters the common inspection/promotion pipeline. READY preview always uses managed media. Better Content never refetches or synchronizes a READY URL Asset. Remote changes and link rot do not affect it; changed media requires a new Asset.

The UI tells creators they must have the right to use submitted media. Successful ingestion is not rights verification.

## 12. Media validation and inspection

### Supported allowlist

| Type | Accepted media | Maximum bytes | Additional bounds |
| --- | --- | ---: | --- |
| IMAGE | JPEG, PNG, static WebP | 10 MiB | width and height each ≤ 12,000; total pixels ≤ 60,000,000 |
| VIDEO | MP4 with H.264/AVC and optional AAC audio | 500 MiB | display dimension ≤ 3,840; total pixels ≤ 8,294,400; duration ≤ 1,800,000 ms |
| AUDIO | MP3 Layer III, MP4/M4A AAC, PCM WAV | 100 MiB | duration ≤ 3,600,000 ms |

Reject every unlisted format/codec. In particular, V1 excludes SVG, animated WebP, GIF/APNG, AVIF, HEIC/HEIF, TIFF, BMP, ICO, MOV, WebM, MKV, AVI, HEVC/H.265, VP8/VP9, AV1, OGG, Opus, FLAC, AIFF, and raw AAC.

Filename extension, browser MIME, URL extension, and remote Content-Type are preliminary only. Upload extensions must match detected format. URL extensions are optional. Declared/detected mismatch fails rather than relabeling.

### Inspector boundary

`MediaInspector` is a provider-neutral server application boundary. Its production adapter uses:

- a direct runtime dependency on Sharp for JPEG, PNG, and static WebP validation and display-oriented dimensions;
- a pinned deployment ffprobe executable for MP4/MP3/M4A/WAV container, codec, dimensions, rotation, and duration inspection.

Use ffprobe only; Phase 6 does not transcode or convert with FFmpeg. Invoke it without a shell, with fixed arguments, bounded stdout/stderr, a process timeout, strict JSON result validation, and no remote protocol access. Creator filenames and URLs never become process arguments or paths.

The worker downloads one managed staging object into an application-generated temporary file while enforcing the byte ceiling, inspects it, promotes it, removes/reuses the temp location, then downloads and inspects the permanent object again before READY. Compare the normalized permanent result with the approved staging result and declared media type. Keep at most one full media file per heavy job on local disk at a time.

Duration milliseconds are the ceiling of authoritative seconds×1,000. Dimensions are display-oriented after rotation/EXIF interpretation. Values must be positive and finite.

The inspector returns normalized metadata only. Raw Sharp/ffprobe output is not persisted or exposed. Missing inspector runtime, crashes, timeouts, and invalid output fail safely through the infrastructure failure path.

### No general scanning

Staging is quarantine and inaccessible to creators. Hardened allowlist inspection is the V1 security boundary; no antivirus, steganography detection, content moderation, or malware-free claim is added. Production must patch supported Sharp/ffprobe versions when relevant security fixes are released.

## 13. Object-storage architecture

```text
Assets application service
→ AssetStorage
├── S3CompatibleAssetStorage
├── FilesystemAssetStorage
└── FakeAssetStorage
```

`AssetStorage` exposes the smallest operations needed for exact staging PUT issuance, metadata/size checks, server-controlled promotion, private read capability issuance, streaming reads, and idempotent deletion. Provider SDK types do not escape the adapter.

The production S3-compatible adapter is configured by environment for endpoint, region, bucket, credentials, and compatibility flags. ArvanCloud is the initial provider; no Arvan endpoint, bucket URL, credential, SDK object, or signed URL is persisted. Use one active backend per environment. Provider migration copies/verifies objects while preserving keys, then switches configuration without changing Assets, Content, or Versions.

Use one dedicated private, non-versioned managed-media bucket/namespace per environment. Object versioning must be disabled. Use opaque cryptographically random keys under separate namespaces, conceptually `staging/<random>` and `permanent/<random>`. Creator data never appears in keys.

Before permanent creation, the PROCESSING Asset reserves one `permanentStorageKey` in PostgreSQL and commits it. All retries use that key. READY objects are never overwritten. Existing candidate objects must correlate to the reserved key and pass authoritative inspection.

Filesystem storage lives outside the public application tree and implements the same privacy/lifecycle semantics. Tests use a deterministic in-memory/fake adapter except narrow filesystem and S3-compatible contracts.

Normal local development requires no cloud credentials. An opt-in ArvanCloud integration configuration may exercise real PUT, private retrieval, range playback, promotion, headers, expiry, and deletion.

## 14. Private preview and download access

All storage objects are private. A media capability is issued only after fresh authentication, Workspace membership authorization, same-Workspace Asset lookup, READY verification, and permanent-key resolution.

Read capabilities:

- authorize exactly one permanent object;
- are read-only;
- expire after exactly 900 seconds;
- return `{ url, expiresAt }`, with expiry derived from the signer;
- are never persisted in PostgreSQL, Content, Versions, projection rows, jobs, recovery output, logs, localStorage, sessionStorage, or application caches;
- are returned with `Cache-Control: private, no-store` and held only in browser memory.

Images request access just in time and need no proactive refresh after successful load. Active video/audio preview refreshes authorization approximately 90 seconds before expiry, stops refreshing when inactive/unmounted, and preserves basic playback position/state where technically practical. Refresh always reauthorizes; failure stops new requests and presents a localized retry/access message.

Downloads use a fresh 15-minute capability. A transfer started before expiry follows provider behavior; a new/resumed request after expiry requires a new capability. Once an Asset is DELETING or access is removed, Better Content issues no new capability. Previously issued capabilities remain usable only within their storage validity; no revocation database or media proxy is added.

Permanent objects use authoritative detected MIME, safe inline disposition for preview where useful, safe attachment disposition for download, and `X-Content-Type-Options: nosniff` where supported. ArvanCloud contract tests must verify private denial, signed GET, range requests, seeking, expiry, and response-header behavior.

## 15. Asset Library UX

Add a dedicated Workspace Assets page using Server Components for authorization/initial queries and small client boundaries for forms, polling, preview, and mutations.

The collection is flat, newest-created first with ID as deterministic tie-breaker, and server-paginated at 24 items per page. Use simple URL-backed page/search/filter state and ordinary escaped database substring matching; no external search system.

Cards/rows show:

- display name;
- media type;
- PENDING, PROCESSING, READY, FAILED, or DELETING status;
- authoritative size and media metadata when available;
- localized Upload source or safe source hostname;
- “Referenced in N contents” derived from distinct Content IDs.

Search covers display name and upload-only original filename. Filters cover media type and lifecycle, including DELETING for management visibility, with a clear reset. Default ordering is fixed; there are no creator sort preferences.

READY images may lazily request and display their original managed image only when visible. Video/audio cards use type placeholders. Selecting an item opens a responsive dialog/sheet detail surface with full accessible name, native preview, safe metadata, rename, download, and reference-aware deletion. No dedicated Asset-detail route is required in V1.

PENDING/PROCESSING/FAILED/DELETING remain visible with localized states. DELETING disappears only after hard deletion. Lifecycle polling runs every five seconds while the relevant Library/picker interaction is visible, backs off to 15 seconds after one minute, and stops on terminal state, close, unmount, or loss of relevance. No realtime transport is introduced.

Creation supports one file or one link at a time from the Library and eligible editor picker. A single-file drop target may supplement, never replace, the accessible file input. No batch creation or management exists.

## 16. Editor picker and attachment UX

`BROLL_CUE` exposes READY IMAGE/VIDEO Assets. `SOUND_CUE` exposes READY AUDIO Assets. Other directions expose no Asset control.

The picker is Workspace-scoped, authorized, bounded/paginated, searchable by display/original filename, and prefiltered to compatible READY media. It supports preview, explicit Use Asset, Replace, Detach, Upload media, and Add media link. It identifies the current selection and returns focus to the invoking direction control when closed.

Creating media inside the picker creates a normal Workspace Asset visible in the Library. PENDING/PROCESSING creation may appear in a lifecycle area but is not selectable. READY completion does not auto-attach; the creator must explicitly choose Use Asset. Failed creation leaves the direction unchanged.

Use Asset, Replace, and Detach mutate the canonical local V3 document and follow normal autosave/revision/conflict behavior. Replace changes only `assetId`; it does not delete or mutate the old Asset. Detach removes only `assetId` and never deletes media.

The server repeats authorization, READY, same-Workspace, compatibility, lifecycle-lock, cardinality, and Draft-revision checks when saving. A previously loaded picker result is never trusted as current authority.

## 17. Deletion and retention

### Creator deletion

Deletion is explicit, irreversible, and reference-safe:

```text
authorize and lock Asset
→ verify lifecycle eligibility
→ verify zero derived Draft/Version references
→ set DELETING and enqueue cleanup atomically
→ delete staging/permanent objects asynchronously
→ confirm absence
→ hard-delete Asset metadata last
```

PENDING, READY, and FAILED Assets may enter deletion when eligible. PROCESSING deletion returns a localized processing conflict. Any current Draft or surviving immutable V3 Version reference returns `ASSET_IN_USE`; nothing detaches or rewrites automatically.

DELETING remains visible but disabled until cleanup completes. Missing storage objects are idempotent deletion success, but an unexpectedly missing permanent object from a formerly READY Asset emits an integrity anomaly. Cleanup retry exhaustion leaves the Asset DELETING and alertable; reconciliation or authorized operations may safely re-enqueue cleanup.

### Retention and operational cleanup

- Valid zero-reference READY Assets remain indefinitely.
- FAILED metadata remains until creator deletion.
- An unfinalized UPLOAD/PENDING Asset expires 24 hours after creation, transitions to FAILED/UPLOAD_EXPIRED under a lock, and schedules staging cleanup.
- Worker-local temporary files are removed after every attempt.
- Staging is removed after READY or terminal FAILED unless an active retry still needs it.
- Unowned staging older than 24 hours may be deleted only after authoritative database/job recheck.
- A permanent object with no owning Asset is an anomaly; after at least 24 hours it may be deleted only after PostgreSQL recheck proves no Asset or recoverable job can claim its exact key.
- Uncertain ownership means retain and alert.

Provider lifecycle policies are defense in depth only. The application cleanup/reconciliation path remains authoritative. Creator deletion removes active application media and metadata; it does not promise immediate erasure from provider-controlled disaster-recovery backups.

Content deletion remains out of scope and must not be introduced as an Asset cascade.

## 18. Background jobs and worker execution

Implement the minimum ADR-009 PostgreSQL job foundation needed by Phase 6. Job payloads contain stable internal identity only, conceptually `{ assetId }`; they never contain media, source URLs, signed URLs, credentials, or browser state.

Required job families cover:

- uploaded-media processing;
- external-URL ingestion and processing;
- Asset deletion;
- upload/staging expiration cleanup;
- bounded storage/reference reconciliation.

Jobs use transactional claim/lease semantics, bounded attempts, safe failure categories, scheduled retry time, and unique logical ownership so duplicate Finalize or job delivery cannot create parallel authoritative workflows. Use five total attempts with exponential backoff plus jitter capped at one hour as the V1 operational default; configuration may tune this without changing product semantics. Deterministic validation/security failures do not retry.

The dedicated server-side job runner executes outside normal Next.js user-request lifecycle. It may run as repeated scheduled invocations or a supervised loop using the same handlers and PostgreSQL claims. The web path enqueues and returns. Slow URL/storage/inspection work holds no database transaction open.

Begin with one heavy media job per runner. Lease heartbeats keep long work owned; crash expiry makes it reclaimable. Cleanup/reconciliation use bounded batches. Runner mode, scheduler cadence, and batch size are deployment settings.

READY is an idempotent processing no-op. FAILED does not restart from duplicate delivery. DELETING never reenters processing. Retries reuse the reserved permanent key. Reconciliation repairs operational drift but never becomes a second source of truth.

## 19. Authorization

Every private operation requires authenticated user, current Workspace membership, and resource ownership. Client-provided IDs never prove access.

Existing V1 roles govern Assets:

- a Workspace member may list, search, inspect metadata, preview, and download Assets in that Workspace;
- the existing owner mutation role may begin/finalize creation, rename, attach, replace, detach, and delete.

There is no Asset-specific role, ACL, guest access, share link, or public read.

Attachment validates both Content and Asset under the same Workspace. Foreign Asset, Content, or Version IDs use established nondisclosing NOT_FOUND/FORBIDDEN behavior. Capability issuance performs a fresh READY check. Storage keys are not authorization and knowledge of one grants no access.

Attachment and deletion serialize on the affected Asset rows. Asset locks are acquired in deterministic ID order for multi-reference document validation. If attachment wins, deletion observes a reference and fails; if deletion wins, attachment observes non-READY DELETING state and fails. The database Asset FK restricts destructive deletion while projection rows survive.

## 20. EN/FA, RTL/LTR, and filename behavior

All Phase 6 labels, controls, status/failure messages, forms, dialogs/sheets, empty states, confirmations, filters, and accessibility text are localized in English and Persian. Use the existing locale architecture, semantic `lang`/`dir`, logical CSS properties, and locale-aware typography. UI locale never mutates creator data or media orientation.

`displayName` is required, trimmed at its outer boundary, and 1–200 Unicode code points. Preserve internal Unicode without transliteration, case folding, or compatibility normalization. Reject NUL, CR, LF, C0/C1 controls, and Unicode Bidi_Control characters; retain legitimate Persian ZWNJ. Count Unicode code points rather than JavaScript UTF-16 code units.

`originalFilename` is immutable UPLOAD-only provenance. Accept only a Unicode leaf filename, never a path. Reject NUL, CR/LF, unsafe controls, and path components. EXTERNAL_URL Assets have no original filename.

Render creator-controlled names with bidi isolation and content-driven direction, conceptually `<bdi dir="auto">`. Truncation never changes stored text, and the full name remains keyboard/mobile/assistive-technology accessible.

Download filenames are derived at request time from sanitized display name and authoritative format. Use an ASCII fallback and UTF-8 `filename*`; never interpolate raw text into headers. If the sanitized display name does not already end case-insensitively with the canonical extension, append `.jpg`, `.png`, `.webp`, `.mp4`, `.mp3`, `.m4a`, or `.wav` as appropriate without stripping another suffix.

## 21. Observability and reconciliation

Use the existing structured logger, PostgreSQL Asset/job state, bounded reconciliation, and deployment-configured alert routing. Do not add a metrics/tracing vendor, event bus, telemetry database, or admin dashboard.

Log material creation, Finalize, lifecycle transition, retry/exhaustion, deletion, cleanup, capability denial/failure, storage/inspector failure, and integrity/reconciliation events. Extend the logger's allowlisted context only with safe bounded fields required for Asset/job correlation, such as job ID/type, Asset ID through the existing entity field, media/source type, attempt, transition, byte count, duration, and bounded summary counts.

Never log source URL, filename/display name, signed URL/parameters, credentials, storage key under normal logging, object contents, Content/direction text, remote bodies/headers/IPs, raw parser output, or temp paths.

Reconciliation must detect or make queryable:

- exhausted or stale jobs/leases;
- unexplained PROCESSING or DELETING state;
- expired uploads and staging backlog;
- safe orphan candidates and uncertain retained objects;
- missing READY objects;
- reference projection mismatch;
- PostgreSQL/storage ownership mismatch;
- sustained provider/inspector/runner failure.

READY-object checks are bounded/targeted or incremental; do not HEAD every object every run. Confirmed missing READY media is an alertable integrity incident, not an automatic FAILED transition or source-URL refetch.

Periodic runs emit bounded summaries rather than one event per healthy object. Deployment documentation defines log destination, access, retention, alert routing, and operational retry procedures.

## 22. Migration and cutover

Additive Drizzle migrations add Asset metadata, reference projection, jobs, indexes, checks, foreign keys, and supporting operational state. They perform no object-storage calls and do not rewrite historical migrations or existing V1/V2 document JSON.

Extend the validated Content document union to V1|V2|V3. V2→V3 changes only schema version and adds canonical absence of optional Asset IDs while preserving every block, direction, ID, order, text, and payload exactly.

Opening a stored V1/V2 Draft returns an in-memory V3 editor projection without writes, revision increment, checkpoint, Version, reference rows, or dirty state. The first meaningful creator mutation persists canonical V3 once under the expected revision.

For stored V2, the first meaningful V3 save creates no legacy checkpoint. For stored V1, preserve Phase 5's exact one-time LEGACY_DRAFT_CHECKPOINT and atomically persist V3 without an intermediate stored V2. Accepting a legacy V1 Draft performs the same migration boundary before creating the accepted V3 Version.

Semantic equality explicitly treats V2 as equal to its deterministic V3 projection when no Asset difference exists. Schema version alone does not create unaccepted changes or a new accepted Version. V1 retains its special checkpoint semantics and is not generally declared equal to V2/V3. Unknown schema versions fail explicitly.

New AI generation continues to preserve exact V1 AI Run output and V1 AI_GENERATED Version #1 while creating the mutable Draft directly as canonical V3.

During one deployment compatibility window, a legacy V2 client write may be accepted only when the authoritative Draft is still V1/V2 at the exact expected revision; the server persists V3. Once a Draft is V3 it never accepts a V2 downgrade. Revision races allow exactly one winner. Remove stale-client V2 write compatibility in a later reviewed deployment after it is operationally safe; retain V1/V2 read support indefinitely while artifacts exist.

V1/V2 produce no Asset references. V3 persistence creates projection rows atomically. Migration review must preserve the existing same-Content accepted-Version composite integrity constraint.

## 23. Security requirements

- All server boundaries use strict runtime validation; client validation is UX only.
- Object storage is private, non-versioned, and inaccessible without scoped capabilities.
- Staging is quarantine and never previewable.
- Media type/format/codec/size/dimensions/duration are verified from managed bytes before READY.
- SVG and arbitrary active/document formats remain rejected.
- ffprobe uses no shell, creator path, or remote protocol and runs with bounded resources and least practical privilege.
- Sharp uses input-pixel/resource limits before decode-intensive work.
- Worker temp paths are generated, bounded, private, and always cleaned.
- External ingestion uses the SSRF and redirect controls in Section 11.
- Source URLs are plaintext private application data but remain excluded from logs, jobs, documents, errors, analytics, and ordinary UI.
- Upload/read capabilities are scoped bearer credentials, short-lived, unpersisted, and omitted from logs/caches.
- Authoritative MIME and safe content-disposition/header encoding prevent creator metadata from controlling response semantics.
- Rate/admission controls are transactionally enforced in PostgreSQL.
- Processing and deletion are idempotent across crashes and duplicate delivery.
- No successful database state may point READY at a missing/unvalidated object; metadata is deleted only after object cleanup.
- Provider credentials and bucket configuration remain server-only environment secrets.
- The application never claims successful ingestion verifies copyright or malware absence.

## 24. Testing strategy

Follow `docs/agents/testing-standards.md`: use the lowest layer that reliably proves behavior and reserve E2E for critical browser-to-database journeys. Test externally observable rules rather than implementation structure.

### Primary seams

- Content document domain functions prove V3 validation, canonicalization, projection, equality, and recovery representation.
- Asset application services are the highest functional seam for lifecycle, authorization, storage orchestration, and deletion.
- Content Draft/acceptance application services prove Asset validation and projection atomicity.
- `AssetStorage`, `MediaInspector`, and controlled remote-fetch boundaries receive focused contract suites.
- PostgreSQL integration tests prove migrations, transactions, locks, constraints, jobs, and lineage.

### Unit/domain and component tests

Cover:

- V3 strict unions and eligible/ineligible Asset fields;
- V2→V3 lossless projection and V2/V3 semantic equality;
- attachment compatibility/cardinality and recovery output;
- lifecycle transitions, limits, format/codec normalization, duration rounding, filename rules, and source URL parsing;
- public/non-public IP classification and redirect-policy decisions;
- Unicode code-point bounds, ZWNJ acceptance, Bidi_Control rejection, and safe download filenames;
- Library/picker lifecycle presentation, polling stop/backoff, focus return, native preview behavior, and EN/FA direction.

### PostgreSQL integration tests

Cover:

- Workspace authorization, ownership, and nondisclosure;
- concurrent 30/user, 60/Workspace, and five-active admission enforcement;
- Begin/Finalize idempotency and upload-expiration races;
- job claim/lease/reclaim, bounded retry, and duplicate delivery;
- permanent-key reservation before object creation and retry reuse;
- READY commit only after permanent validation;
- V3 Draft/Version projection atomicity and deterministic rebuild;
- same-Workspace/Content/Version constraints;
- attachment versus deletion and detach versus deletion races;
- every surviving Version blocking deletion;
- DELETING object-first hard deletion and retry exhaustion behavior;
- staging/orphan proof and uncertain-object retention;
- V1/V2 lazy cutover, exact V1 checkpoint, equality, stale V2 write rejection, and immutable historical JSON.

### Adapter and security contracts

- Fake and filesystem storage contracts run in normal CI.
- Media fixtures cover every accepted format and representative corrupt, truncated, spoofed, over-limit, animated, and unsupported codec/container case.
- Controlled remote-fetch tests inject DNS/transport behavior for private ranges, rebinding, redirects, timeouts, header limits, byte ceilings, and non-media responses without arbitrary internet dependence.
- An opt-in ArvanCloud contract verifies private denial, presigned PUT/GET, expiry, exact-object scope, Content-Length behavior, atomic visibility/copy, range seeking, response headers, and deletion.
- Logger tests prove URLs, signed credentials, names, contents, parser output, and storage identities are absent.

### E2E and manual QA

Keep Playwright representative:

1. one EN/LTR upload→processing→READY→attach→autosave→accept/history journey using deterministic adapters;
2. one FA/RTL Asset Library/link or management journey covering mixed-direction names, preview, and a safe failure/deletion state.

Do not create a media×format×locale×lifecycle E2E matrix. Manual QA covers English/Persian desktop/mobile, long and mixed-direction names, keyboard/focus behavior, responsive detail/picker surfaces, image lazy preview, native media controls, and interrupted upload/processing feedback.

Required phase checks are format check, lint, typecheck, unit tests, PostgreSQL integration tests, build, selected E2E, adapter contracts, accessibility review, responsive review, and EN/FA RTL review.

## 25. Deployment requirements

The Better Content modular monolith gains a web entry point and trusted server-side job-runner entry point using the same modules, configuration, PostgreSQL queue, AssetStorage, and MediaInspector. The runner executes outside normal user HTTP requests. Production may supervise a loop or invoke bounded runs according to host capabilities.

The production worker environment must provide:

- the approved Node runtime;
- a package-lock-pinned Sharp dependency;
- an exact deployment-pinned ffprobe build whose version is verified at startup;
- child-process execution;
- outbound HTTPS;
- PostgreSQL connectivity;
- private S3-compatible storage access;
- sufficient execution time for 500 MiB processing;
- at least 1 GiB usable application-controlled temporary disk per concurrent heavy media job;
- structured log retention/search and critical alert routing;
- graceful termination and job lease recovery.

Start with one concurrent heavy media job. Increase only after measuring CPU, disk, database, and storage behavior. The actual compute host remains a deployment decision.

Required storage configuration includes a dedicated private bucket/namespace, versioning disabled, application-origin-restricted CORS for required PUT/GET behavior, server-only credentials, and provider configuration outside PostgreSQL. Local development defaults to filesystem storage and a manually invoked or simple watch runner.

Before production launch, document and prove worker execution mode, cadence/polling, lease behavior, ffprobe provisioning, temp-disk capacity, storage CORS/private access, logs, alert destination, retention, and authorized cleanup retry procedure.

If a selected host cannot satisfy the worker contract, stop for architecture review. Do not move work into HTTP, reduce approved limits, remove inspection, or add an external processor silently.

## 26. Acceptance criteria

Phase 6 is acceptable only when all applicable criteria below are implementation-verifiable and passing.

### Domain and lineage

1. Assets belong to exactly one Workspace and support only the approved media/source types.
2. READY media identity and technical metadata cannot be replaced in place; display-name edits do not change Content equality.
3. V3 allows one optional compatible Asset only on BROLL_CUE and SOUND_CUE and rejects Asset fields elsewhere.
4. Asset attachment/detachment changes Draft revision and accepted/unaccepted equality through normal whole-document persistence.
5. Accepted V3 Versions retain exact Asset IDs, and every surviving V3 Version blocks destructive Asset deletion.
6. No authoritative relationship exists outside the V3 document; the projection is transactionally synchronized and rebuildable.
7. Future publishing lineage remains Publication→Content Version→Asset IDs without new Phase 6 publication rows.

### Migration

8. Reading V1/V2 creates no persistence or dirty state and returns a valid V3 editor projection.
9. V2→V3 preserves every existing stable ID, order, text, and direction payload and creates no checkpoint.
10. Equivalent V2 accepted Version and V3 Draft report accepted with no unaccepted changes.
11. Existing V1 checkpoint semantics remain exact and atomic when the Draft moves directly to V3.
12. Historical V1/V2 Versions and AI output remain unchanged.
13. A stale V2 client cannot downgrade or overwrite a committed V3 Draft.

### Upload, URL ingestion, and READY validation

14. Begin issues only an exact staging PUT capability after authorization/admission validation; no normal HTTP request carries media bytes through Next.js.
15. PUT retry remains possible only while the upload is unfinalized PENDING and inside its 24-hour window.
16. Finalize is short, reauthorized, idempotent, exact-size checked, and creates one logical processing workflow.
17. External ingestion accepts only approved direct HTTPS media and rejects unsafe destinations, rebinding, invalid redirects, non-media responses, excess bytes, and timeouts safely.
18. Jobs contain Asset ID only and never media, URLs, credentials, or signed capabilities.
19. Only allowlisted, in-bounds, permanently re-inspected media becomes READY with all required metadata.
20. Unsupported or corrupt media never becomes READY and no transcoding fallback occurs.
21. PostgreSQL reserves the permanent key before object creation; retries reuse it and READY objects cannot be overwritten.
22. Storage/database failure windows leave recoverable PROCESSING/DELETING state or a conservatively retained orphan, never silent data loss.

### Privacy, authorization, and deletion

23. Cross-Workspace list, metadata, preview, download, attachment, mutation, and deletion attempts fail without disclosure.
24. Only current authorized members receive a 15-minute object-specific READY read capability.
25. Signed capabilities are absent from persistence, Content, logs, caches, and recovery output; active video/audio refresh reauthorizes.
26. Attachment and deletion races have deterministic safe outcomes: a surviving reference or DELETING state always wins over corruption.
27. Referenced deletion returns ASSET_IN_USE and never auto-detaches or rewrites history.
28. Unreferenced eligible deletion remains visibly DELETING until objects are absent and metadata is hard-deleted last.
29. Valid zero-reference READY Assets are not automatically deleted.
30. Expired/staging/orphan cleanup obeys the 24-hour windows and proof-before-delete rule.

### UX, localization, and operations

31. The Workspace Library and eligible-direction picker support the approved create, search, filter, preview, rename, download, attach/replace/detach, and delete workflows without DAM features.
32. PENDING/PROCESSING/FAILED/DELETING states are localized, accessible, and non-selectable where required.
33. EN/LTR and FA/RTL layouts work with Persian, Latin, and mixed-direction Asset names without changing creator data.
34. Filename validation, bidi isolation, accessible full-name presentation, and UTF-8 download disposition satisfy Section 20.
35. PostgreSQL admission prevents concurrent requests from exceeding the approved rolling and active-workflow defaults.
36. Processing is idempotent under duplicate delivery and lease recovery; terminal failures do not retry and FAILED never restarts for creators.
37. Reconciliation detects reference/storage/job drift, retains uncertain objects, and emits bounded safe operational evidence.
38. Logs contain useful opaque correlation and stable failure categories without source URLs, signed URLs, names, media, Content text, storage credentials/keys, or raw inspector output.
39. Normal CI uses deterministic adapters; live ArvanCloud and arbitrary remote hosts are not required.
40. The selected production environment passes the worker/storage compatibility gate before launch.

## 27. Explicit future and deferred scope

Future reviewed phases may add:

- additional source types with source-specific provenance behind the stable Asset boundary;
- AI-generated or stock-acquired managed Assets;
- hosted-provider adapters and authenticated connectors;
- thumbnails, poster frames, waveforms, transcoding, or normalized renditions;
- multipart/resumable upload based on measured failure rates;
- persisted integrity checksums, Workspace duplicate suggestions, or physical deduplication as separate decisions;
- Workspace storage accounting, quotas, plans, and billing;
- folders, tags, collections, bulk operations, richer usage navigation, or archival retention;
- portable Version/media package export;
- Asset-level learning or analytics reached through Publication→Version→Asset lineage;
- stronger compliance retention, malware scanning, or public delivery after separate security/provider review;
- Content deletion with an explicit reference-aware retention policy.

Future-ready means stable Asset identity, managed-media lifecycle, provider-neutral storage/inspection, immutable Version references, and Content using Asset IDs. It does not mean reserving speculative enums, fields, providers, or workflows now.

## 28. Required ADR and documentation reconciliation

Before implementation tickets are approved:

1. Create an Asset domain/lifecycle/lineage ADR covering Workspace ownership, immutable READY media, ContentDocumentV3 authority, derived references, acceptance lineage, and reference-safe deletion.
2. Create a managed-storage/ingestion/security ADR covering private S3-compatible storage, ArvanCloud as initial configuration, storage adapters, staging/promotion, permanent-key reservation, direct HTTPS ingestion, inspection, capabilities, and the external worker boundary.
3. Amend ADR-003 to state that Asset attachment is a meaningful Content mutation captured by immutable Versions and protected through Version lineage.
4. Amend ADR-004 for ContentDocumentV3, eligible direction Asset IDs, lazy V2→V3 projection, V2/V3 semantic equality, preserved V1 checkpoint behavior, and immutable V1/V2 history.
5. Clarify ADR-009 so its internal runner is trusted server-side execution outside normal user HTTP lifecycle and may be scheduled or supervised without changing the PostgreSQL job architecture.
6. Leave ADR-008 unchanged; Asset source URLs are ordinary plaintext PostgreSQL application data, not encrypted social credentials.
7. Update the PRD to record upload/direct-link Asset creation, managed preview, approved attachment types, Workspace reuse, and the lightweight-library boundary.
8. Update Architecture to replace deferred Asset decisions with the approved module, persistence, storage, worker, security, and V3 lineage model; remove stale Phase 5 taxonomy/anchoring deferrals where already superseded.
9. Publish the approved Phase 5 specification into the canonical phase-document set if repository policy requires it; do not let stale ticket statuses override completed/approved Phase 5 behavior.

No Phase 6 implementation ticket may redefine these decisions. Ticket decomposition begins only after this specification and required ADR/documentation changes receive Product Architect approval.
