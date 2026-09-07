# ADR-019: Use Private S3-Compatible Managed Media With Validated Ingestion

- **Status:** Accepted
- **Date:** 2026-09-07
- **Decision owners:** Product Architect / Technical Lead
- **Applies to:** Phase 6 Assets

## Context

Assets may contain private, unpublished creator media. Uploaded files and
creator-supplied links must converge on one previewable, immutable managed-media
invariant without storing large media in PostgreSQL, exposing permanent public
URLs, trusting client metadata, or coupling the domain to one object-storage
vendor.

External URL ingestion also introduces SSRF, redirect, size, link-rot, and
remote-mutation risks. Large files and remote retrieval cannot be processed
inside ordinary HTTP request lifetimes.

## Decision

### Provider-neutral private storage

Media bytes live in private S3-compatible object storage behind an
`AssetStorage` application port and S3-compatible adapter. ArvanCloud Object
Storage is the initial configured managed provider, not a domain dependency.
One managed backend is active per environment.

PostgreSQL is the metadata source of truth. Asset metadata stores opaque staging
and permanent storage keys and provider-neutral media metadata. It never stores
media blobs, signed URLs, provider endpoint/bucket URLs, credentials, SDK
objects, or temporary preview URLs.

Normal local development uses a filesystem adapter without cloud credentials.
Automated tests use a deterministic fake; narrow opt-in contract tests may use
an S3-compatible environment. Provider migration copies and verifies objects
under preserved keys before configuration switches, without changing Asset IDs
or Content documents.

### Upload ingestion

Upload Begin validates declared media type, exact declared size,
name/filename safety, supported extension, and extension compatibility with the
declared media type. Browser MIME is preliminary only and cannot by itself
reject an otherwise eligible upload.

Begin creates an UPLOAD/PENDING Asset and a private staging key, then issues one
scoped four-hour presigned PUT. V1 uses a single complete-object PUT, not
multipart or resumable upload. Interrupted upload may restart against the same
staging key only while the Asset remains unfinalized PENDING and within its
24-hour upload session.

Finalize reauthorizes, locks/reloads, verifies staging presence and exact size,
and transactionally establishes one unique logical ADR-009 processing workflow
for the Asset. That job/idempotency boundary is the durable proof of Finalize;
no additional Asset status is required.

```text
unfinalized PENDING
  → replacement PUT allowed
  → abandoned-upload expiration applies

finalized PENDING
  → replacement PUT forbidden
  → abandoned-upload expiration forbidden
  → processing job awaits claim
```

Concurrent Finalize calls converge on the same workflow. A separate persistence
field/entity is justified only if the generic job model cannot safely enforce
this invariant.

### External URL ingestion

EXTERNAL_URL supports direct, public, unauthenticated HTTPS media URLs only.
The system snapshots the response into managed storage; it never treats the
remote URL as permanent media identity. Hosted media pages, YouTube/Vimeo
pages, social posts, private/authenticated URLs, custom headers, cookies,
userinfo, nonstandard ports, and interactive login are unsupported.

Every initial URL and redirect hop is parsed and revalidated. DNS results are
pinned or equivalently protected against rebinding, and loopback, link-local,
private, reserved, metadata-service, and other non-public destinations are
blocked for IPv4 and IPv6. Redirects are bounded. Retrieval streams through a
strict byte ceiling and rejects non-media, unsupported, or unsafe responses.
The creator-supplied source URL is ordinary plaintext PostgreSQL application
data with restricted exposure and log redaction; Phase 6 adds no application
encryption subsystem for it.

### Inspection and READY promotion

UPLOAD and EXTERNAL_URL converge on one asynchronous lifecycle and inspection
path. `MediaInspector` is provider-neutral. The initial implementation uses:

- Sharp for JPEG, PNG, and WebP inspection;
- pinned `ffprobe` for MP4/H.264 with optional AAC, MP3, M4A/AAC, and WAV/PCM.

Actual bytes/container/codecs are authoritative. Processing enforces the
approved byte, dimension, and duration bounds and extracts required technical
metadata. It does not transcode, normalize, optimize, generate thumbnails,
generate waveforms, or create alternate renditions.

Before creating the permanent object, PostgreSQL reserves the Asset's opaque
permanent key. Processing promotes to exactly that key, re-reads and validates
the permanent object, and only then marks the Asset READY. A retry or duplicate
job cannot create a second authoritative permanent object. READY always means
the validated managed original is expected to preview in the supported browser
surface.

### Background execution

ADR-009 PostgreSQL jobs run in a dedicated server-side runner outside normal
user-facing HTTP requests. It remains part of the modular-monolith deployment
and requires Node, Sharp, pinned ffprobe, child-process execution, sufficient
time and temporary disk, PostgreSQL, private object-storage access, outbound
HTTPS, and structured log/alert routing.

Job payloads contain stable internal identity such as `assetId`, never media,
credentials, signed URLs, source URLs, or browser state. Work is idempotent,
lease/reclaim safe, failure-classified, and bounded-retry. No Redis, broker, or
second backend is introduced.

### Private preview and download

Buckets and objects remain private. Authorized application operations issue
capabilities scoped to one object and one operation for 15 minutes. Capabilities
are not persisted and are returned with private/no-store behavior. Every issue
or refresh operation authenticates the user and proves Workspace membership
and resource ownership.

Preview uses the validated original through native image, video, or audio
presentation. Storage/provider behavior must support private denial, signed GET,
range requests and seeking where applicable, expiry, and safe response headers.

### Deletion and recovery

Asset deletion is reference-safe under ADR-018. The Asset first becomes
DELETING. Physical storage cleanup succeeds idempotently before PostgreSQL
metadata is removed; transient failures retry and exhausted deletion remains
DELETING for alerting and reconciliation. The system must never leave a READY
Asset pointing to a knowingly missing object.

Staging, abandoned uploads, and unowned permanent objects are cleaned only
after authoritative PostgreSQL/job ownership rechecks. Uncertain ownership is
retained and alerted.

## Consequences

### Positive

- Private media access is authorized and time-bounded.
- Remote mutation and link rot cannot change READY Asset bytes.
- Storage-provider migration does not rewrite domain identity or Content history.
- One validation path gives uploads and links the same READY guarantee.
- Long media work is isolated from user-facing request lifetimes.

### Tradeoffs

- The deployment must provide a capable background runner and ffprobe.
- URL ingestion and redirects require careful network-level SSRF controls.
- Promotion spans PostgreSQL and object storage and therefore needs idempotent
  reconciliation rather than a distributed transaction.
- Original-media preview depends on the deliberately narrow V1 format allowlist.

## Rejected alternatives

### Public permanent object URLs

Rejected because Assets may be private, unpublished creator media.

### Large media blobs in PostgreSQL

Rejected because object storage is the appropriate byte store and PostgreSQL is
the metadata source of truth.

### Store external URLs as the media

Rejected because remote bytes can change or disappear and cannot preserve
immutable Content Version meaning.

### Proxy large processing through ordinary Next.js requests

Rejected because 500 MiB media inspection and remote ingestion require durable,
retryable execution outside request lifetimes.

### Provider-specific domain records

Rejected because ArvanCloud is initial configuration, not permanent domain
identity.

### Source-URL application encryption

Rejected for Phase 6. Source URLs receive normal private-data authorization,
redaction, and retention controls; ADR-008 remains limited to credentials.

## Invariants

- Permanent objects are private and accessed only through authorized,
  short-lived capabilities.
- READY refers to one immutable, fully inspected managed object.
- Browser MIME, filename, and remote headers are never authoritative media
  validation.
- A permanent key is reserved by PostgreSQL before object creation.
- Finalize has one durable logical job workflow per upload Asset.
- External retrieval cannot reach prohibited network destinations.
- Secrets, signed capabilities, source URLs, and private media are excluded from
  logs and job payloads.
- Object deletion cannot silently strand READY metadata or break Content lineage.

## Relationship to existing ADRs

- ADR-001 remains authoritative for the modular monolith and provider adapters.
- ADR-008 is unchanged and remains scoped to social credentials.
- ADR-009 is clarified for external-to-HTTP runner execution.
- ADR-012 remains authoritative for reviewed database migrations.
- ADR-018 defines Asset lifecycle, references, and deletion eligibility.

## V1 boundaries

This ADR does not select a production hosting vendor, introduce a second
backend, transcode media, support multipart/resumable uploads, expose public
URLs, add application-level source-URL encryption, deduplicate storage, or add
workspace quotas.
