# 04: Deliver the direct upload lifecycle

**What to build:** Let an authorized Workspace owner begin one media upload,
send it directly to private staging, finalize it durably, and have the worker
produce either one immutable READY Asset or a safe terminal failure.

**Blocked by:** 02 — Establish PostgreSQL Asset jobs and provider-neutral
storage; 03 — Validate managed media through Sharp and ffprobe.

**Status:** resolved

## Scope

- Implement upload Begin, refresh/replacement PUT while eligible, and Finalize
  application boundaries with current Workspace-owner authorization.
- Implement PostgreSQL-backed rolling/admission controls, PENDING Asset creation,
  staging-key allocation, and a four-hour object-specific single-PUT capability.
- Make one unique logical upload-processing job the durable Finalize boundary.
- Implement the asynchronous upload processor: staging verification, streamed
  inspection, permanent-key reservation, promotion, permanent re-read/
  reinspection, normalized metadata persistence, READY/FAILED transition,
  retry-safe cleanup, and idempotency.
- Implement 24-hour unfinalized-upload expiration and staging cleanup.

## Architecture and documentation references

- Phase 6 specification ``5, 9, 10, 12, 13, 17–19, 21, 23, 25 and acceptance
  criteria 14–16, 18–22, 29, 30, 35–40.
- ADR-019 upload ingestion, inspection/READY promotion, background execution,
  and recovery.
- ADR-009 unique Finalize workflow, job retries, and external runner.
- ADR-018 lifecycle and immutable READY media.
- AGENTS authorization, transactions, external-call, validation, error,
  security, and logging rules.

## Expected behavior

- Begin validates declared media type, positive exact byte size, per-type maximum,
  display name, safe Unicode leaf filename, supported extension, and
  extension/declared-type compatibility before creating an UPLOAD/PENDING Asset.
- Browser MIME is preliminary. An otherwise eligible Begin is not rejected
  solely because browser MIME disagrees with the filename.
- Accepted creation consumes the race-safe admission budget: 30 Asset creations
  per user/rolling hour, 60 per Workspace/rolling hour, and at most five active
  PENDING/PROCESSING ingestions per Workspace. Denial creates no Asset/key.
- Begin returns a four-hour capability scoped to one private staging object and
  one complete PUT. Media bytes do not pass through ordinary Next.js requests.
- An interrupted upload can obtain a replacement PUT capability against the same
  staging key only while PENDING is unfinalized and less than 24 hours old.
- Finalize reauthorizes, locks/reloads, verifies staging existence and exact
  stored length, and atomically creates/finds one logical processing job. It
  returns promptly and concurrent calls converge.
- Once the workflow exists, the PENDING upload cannot receive another PUT or
  expire as abandoned; it waits for a job claim.
- The processor validates staging, reserves the permanent key in PostgreSQL
  before creating it, promotes exactly once, re-reads/reinspects the permanent
  object, compares normalized results, and marks READY only after success.
- Deterministic validation/security failures fail immediately. Transient
  storage/inspector failures use bounded ADR-009 retries; exhaustion becomes
  FAILED. A new creator attempt creates a new Asset.

## Implementation constraints and invariants

- Acquisition is source-specific only until media is present in managed staging
  storage. From that boundary onward, UPLOAD and EXTERNAL_URL must use the same
  shared pipeline for authoritative inspection, `permanentStorageKey`
  reservation, promotion, permanent-object validation, READY metadata
  persistence, retry/idempotency, terminal failure handling, and staging
  cleanup. Do not duplicate this pipeline by source type.
- No extra Finalized/Queued Asset status or competing Finalize flag/entity unless
  the generic unique job boundary demonstrably cannot enforce the approved
  invariant; that condition requires review before divergence.
- Do not hold transactions across storage/inspection. Use short state/reservation
  transactions plus idempotent external operations and reconciliation-safe
  states.
- A retry or duplicate job uses the reserved key and can never create multiple
  authoritative permanent objects. READY is a safe no-op and cannot be
  overwritten.
- PENDING/staging is quarantine: no preview/download capability is issued.
- Preserve staging while an automatic retry still requires it; clean it after
  READY, terminal FAILED, or proven expiration.
- ETags are storage-operation details only, not Asset identity, checksum, or
  duplicate detection.

## Explicit non-goals

- Asset Library/picker UI, external URLs, private READY reads, creator deletion,
  multipart/resumable/range upload, upload through Next.js, transcoding,
  deduplication, quotas, Content attachment, or automatic Content cleanup.
- Live ArvanCloud in normal tests; use fake/filesystem adapters.

## Acceptance criteria

- [x] Begin enforces authorization, approved filename/type/size rules, and
      race-safe admission without treating browser MIME as authoritative.
- [x] Begin creates one PENDING Asset/staging key and issues only a scoped
      four-hour complete-PUT capability; no application request accepts media
      bytes.
- [x] Replacement PUT is possible only for unfinalized PENDING inside 24 hours.
- [x] Concurrent/repeated Finalize calls create/find exactly one logical job,
      forbid future PUT replacement, and protect finalized PENDING from
      abandoned expiration.
- [x] Stored-size mismatch, missing/expired staging, unsupported/corrupt media,
      and media-type/extension mismatch never reach READY and map safely.
- [x] Processing reserves one permanent key before object creation, reuses it on
      retry, revalidates the permanent object, and persists complete normalized
      READY metadata atomically.
- [x] Duplicate delivery, worker crash/lease reclaim, and storage/database
      failure windows recover without duplicate permanent identity or silent
      loss.
- [x] Unfinalized uploads expire after 24 hours under lock; finalized jobs win
      the expiration race and staging is deleted only when no retry needs it.
- [x] Logs expose stable opaque correlation/failure codes without filenames,
      storage keys, signed capabilities, media, or provider internals.

## Focused tests

- **Unit/domain/application:** Begin/Finalize validation, MIME-hint semantics,
  capability eligibility, lifecycle transitions, stable failure mapping, and
  admission decisions.
- **PostgreSQL integration:** user/Workspace/active-workflow admission races,
  Finalize/refresh/expiration races, unique workflow, permanent-key reservation,
  READY/FAILED atomicity, retry/exhaustion, and authorization isolation.
- **Storage/processor integration:** deterministic fake/filesystem success,
  duplicate job, missing/mutated staging, copy/re-read mismatch, partial
  storage/database failure windows, and cleanup.
- **E2E:** none; the representative upload journey belongs to Ticket 10.
