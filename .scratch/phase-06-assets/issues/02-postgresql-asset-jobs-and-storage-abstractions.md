# 02: Establish PostgreSQL Asset jobs and provider-neutral storage

**What to build:** Give Asset workflows durable, retry-safe execution and
private provider-neutral storage primitives that work deterministically in
tests and without cloud credentials in local development.

**Blocked by:** 01 — Establish the Asset domain, persistence, and
ContentDocumentV3 foundation.

**Status:** resloved

## Scope

- Implement the minimum ADR-009 PostgreSQL job foundation required for uploaded
  media processing, external URL ingestion, Asset deletion, upload/staging
  cleanup, and bounded storage/reference reconciliation.
- Implement transactional claim, lease heartbeat, stale-lease reclaim,
  completion, retry scheduling, exhaustion, and unique logical workflow
  ownership.
- Add a dedicated server-side runner entry point outside normal user-facing
  Next.js request execution.
- Define `AssetStorage` and implement a provider-neutral S3-compatible adapter,
  deterministic fake, and filesystem development adapter.
- Define disjoint staging/permanent namespaces, opaque application-generated
  keys, scoped PUT/read capabilities, HEAD/read/copy/delete operations, and
  permanent-key reservation seams.

## Architecture and documentation references

- Phase 6 specification ``5, 9, 10, 13, 18, 21, 23, 25 and acceptance criteria
  14–16, 18, 21, 22, 35–40.
- ADR-019 provider-neutral storage, upload Finalize, background execution,
  private access, and recovery decisions.
- ADR-009 in full, especially external-to-HTTP execution and Finalize
  idempotency.
- ADR-001 modular monolith; ADR-012 migrations.
- Architecture ``6, 40, 66–70.
- AGENTS rules for jobs, transactions, external calls, logging, dependencies,
  and avoiding premature infrastructure.

## Expected behavior

- Due jobs are claimed transactionally without double ownership. Leases can be
  heartbeated and safely reclaimed after worker death.
- Jobs carry only stable internal identity, conceptually Asset ID. They never
  persist media, source URLs, signed capabilities, credentials, storage keys,
  creator text, or browser state in payloads.
- Phase 6 jobs use bounded retry bookkeeping and stable failure categories.
  The operational default is five total attempts with exponential backoff plus
  jitter capped at one hour; deterministic failures can terminate immediately.
- One unique logical uploaded-media workflow per Asset is the durable proof that
  Finalize succeeded. Concurrent insertion attempts converge without adding an
  Asset status or requiring a separate Finalize lifecycle.
- READY processing is a no-op, FAILED is not accidentally restarted, and
  DELETING never reenters media processing.
- The runner can execute a bounded batch once or run under supervision without
  exposing a creator-accessible job endpoint. Start with one heavy media job at
  a time.
- Storage adapters enforce private, namespace-scoped operations and treat
  missing deletion as idempotent success. The filesystem adapter supports
  normal offline development; the fake permits deterministic failures and
  operation observation.
- PostgreSQL reserves one opaque permanent key on the Asset before any later
  processor creates that permanent object. Retries reuse the same key.

## Implementation constraints and invariants

- Keep jobs and Assets inside the modular monolith; do not add Redis, BullMQ,
  RabbitMQ, Kafka, another database, microservice, or second backend.
- Do not hold a PostgreSQL transaction open across storage, process, or network
  calls.
- Use repository/application abstractions; provider SDK objects and endpoint
  details must not enter domain records or Content.
- Use one active configured managed storage backend per environment. ArvanCloud
  is configuration of the generic S3-compatible adapter, not a class/domain
  concept.
- Storage keys are opaque authority locators, not authorization, public URLs,
  creator-visible metadata, or content hashes.
- Key allocation must make ownership queryable before object creation and must
  never rely on listing a bucket for identity.
- Implement only the narrow dependencies justified by the approved
  S3-compatible contract. Do not add provider-specific libraries if the generic
  adapter suffices.

## Explicit non-goals

- Upload/Finalize application workflow, remote HTTP fetching, media inspection,
  Asset Library/picker, deletion policy/handlers, or production-host selection.
- Multipart/resumable upload, public objects, media proxying, cross-provider
  per-Asset polymorphism, provider URLs in PostgreSQL, or storage versioning.
- Live ArvanCloud as a normal CI dependency; its opt-in contract belongs to
  Ticket 10.

## Acceptance criteria

- [x] The PostgreSQL job schema and repository support atomic claim, lease,
      heartbeat, reclaim, bounded retry, exhaustion, completion, and safe
      duplicate delivery.
- [x] Unique logical workflow ownership rejects parallel upload-processing
      workflows for one Asset and can durably distinguish unfinalized from
      finalized PENDING.
- [x] Job payload validation permits only the approved stable internal identity
      and rejects/leaves out sensitive or large values.
- [x] The dedicated runner processes bounded work independently of a user HTTP
      request and shuts down without abandoning unrecoverable ownership.
- [x] S3-compatible, filesystem, and fake adapters conform to one
      provider-neutral private-storage contract.
- [x] Staging and permanent namespaces cannot be confused, escaped, listed, or
      addressed using creator-controlled paths.
- [x] Permanent-key reservation is atomic/idempotent and repeated processing
      receives the same key.
- [x] Fake/filesystem behavior proves private scoped access, deterministic
      failure injection, copy/read/delete semantics, and idempotent absence.

## Focused tests

- **Unit/domain:** job payload/type contracts, retry classification/scheduling,
  storage-key generation/namespace validation, and adapter-neutral error
  mapping.
- **PostgreSQL integration:** concurrent claims, lease reclaim, heartbeat,
  retry/exhaustion, unique workflow insertion, permanent-key reservation races,
  and transaction rollback.
- **Adapter contracts:** run one deterministic suite against fake and
  filesystem; cover private access, scope, copy/read/delete, failure injection,
  and complete-object semantics.
- **E2E:** none.
