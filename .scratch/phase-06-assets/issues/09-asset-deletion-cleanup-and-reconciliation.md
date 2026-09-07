# 09: Deliver reference-safe Asset deletion and reconciliation

**What to build:** Let an owner irreversibly delete an eligible unreferenced
Asset while keeping referenced or uncertain media safe and giving operators
idempotent cleanup/reconciliation paths.

**Blocked by:** 07 — Deliver the Workspace Asset Library.

**Status:** ready-for-agent

## Scope

- Add the explicit irreversible creator deletion interaction to the Asset detail
  surface and implement owner-authorized deletion application behavior.
- Implement Asset/reference locking, eligibility/recheck, `ASSET_IN_USE` and
  processing-conflict behavior, atomic DELETING transition, and one logical
  cleanup job.
- Implement object-first asynchronous staging/permanent cleanup, confirmed
  absence, metadata-last hard deletion, retry/reconciliation, and alertable
  exhausted DELETING.
- Implement unfinalized upload expiration, safe staging cleanup, conservative
  permanent-orphan cleanup, reference-projection reconciliation, and bounded
  operational anomaly reporting/re-enqueue.
- Preserve visible lifecycle behavior until cleanup actually completes.

## Architecture and documentation references

- Phase 6 specification ``7, 9, 10, 13, 17–19, 21, 23–25 and acceptance
  criteria 5, 6, 21–30, 36–40.
- ADR-018 reference-safe deletion and zero-reference retention.
- ADR-019 deletion/recovery and private object lifecycle.
- ADR-009 retry/idempotency/runner behavior.
- ADR-003/ADR-004 immutable Version/reference authority.
- Frontend engineering and automated-testing standards.
- AGENTS authorization, transaction, deletion safety, observability, and
  historical integrity rules.

## Expected behavior

- The owner sees an explicit irreversible confirmation naming the Asset and its
  current distinct-Content usage count. Member-only or foreign mutations are
  rejected without disclosure.
- Under deterministic Asset locks, deletion reauthorizes and permits only
  eligible PENDING, READY, or FAILED Assets with zero current Draft and surviving
  immutable V3 Version references.
- PROCESSING returns a localized processing conflict. Any reference returns
  `ASSET_IN_USE`. Nothing detaches, rewrites, or cascades from Content.
- Eligible deletion atomically sets DELETING and enqueues/finds one logical
  cleanup workflow. DELETING is irreversible, non-interactive, visible as
  “Deleting…”, and cannot receive new media capabilities.
- The worker deletes staging/permanent objects idempotently, confirms absence,
  then hard-deletes metadata last. An unexpectedly missing former READY object
  is cleanup success plus an integrity anomaly.
- Transient cleanup failures retry boundedly. Retry exhaustion never becomes
  FAILED; it remains DELETING, alerts, and can be safely re-enqueued through an
  authorized operational/reconciliation path.
- Unfinalized upload expiration applies after 24 hours only when no durable
  upload-processing workflow exists. A Finalize race/job wins over expiration.
- Unowned staging and permanent-orphan candidates are considered only after the
  approved 24-hour windows and authoritative database/job rechecks. Uncertain
  ownership always means retain and alert.
- Reference reconciliation reads canonical V3 artifacts, repairs projection
  drift transactionally, and never changes Content.

## Implementation constraints and invariants

- Attachment/acceptance/deletion serialize on affected Assets in deterministic
  ID order. If attachment wins, deletion observes the reference; if deletion
  wins, attachment observes DELETING.
- Database foreign keys restrict metadata deletion while projection rows exist.
  The canonical document still wins if drift is found.
- Do not delete PostgreSQL metadata before object absence is confirmed. Do not
  leave READY metadata knowingly pointing at a missing object.
- Valid zero-reference READY Assets live indefinitely until explicit owner
  deletion. FAILED metadata also remains until explicit deletion.
- Provider lifecycle rules are defense in depth, never the authoritative
  ownership decision.
- Cleanup/reconciliation uses bounded batches and safe summary logs. It never
  logs storage keys, URLs, names, media, or raw provider errors.

## Explicit non-goals

- Content deletion, Content→Asset cascade, automatic detach, automatic deletion
  of valid zero-reference READY media, Trash/archive/restore, retention flags,
  shared-blob reference counts, or provider-backup erasure guarantees.
- Deleting/rewriting immutable Versions or V1/V2 documents.
- Malware/copyright cleanup, storage quotas, deduplication, or public-link
  revocation.

## Acceptance criteria

- [ ] Only the current Workspace owner can confirm deletion; the UI is explicit,
      irreversible, localized, focus-safe, and shows current usage.
- [ ] Current Draft or any surviving immutable V3 Version reference yields
      ASSET_IN_USE with no state/object/document change.
- [ ] PROCESSING conflicts, while eligible unreferenced PENDING/READY/FAILED
      atomically becomes DELETING with exactly one cleanup workflow.
- [ ] Concurrent attachment/acceptance/deletion produces only the two approved
      safe outcomes and never a dangling reference.
- [ ] Cleanup is idempotent, removes staging/permanent media before metadata, and
      handles already-missing objects without hiding READY integrity anomalies.
- [ ] Storage/database/worker failure windows remain recoverable; exhausted
      cleanup stays DELETING and emits safe actionable operational evidence.
- [ ] Abandoned expiration cannot claim finalized PENDING and cleans only proven
      unfinalized uploads after 24 hours.
- [ ] Staging/permanent orphan cleanup proves absence of Asset/recoverable job,
      honors age windows, and retains every uncertain candidate.
- [ ] Projection reconciliation is bounded/idempotent, restores canonical rows,
      and never edits V3/V1/V2 documents.
- [ ] Valid zero-reference READY Assets are never selected by automatic cleanup.

## Focused tests

- **Unit/application:** lifecycle eligibility, confirmation DTO/copy,
  ASSET_IN_USE/processing conflicts, cleanup state transitions, candidate age/
  proof rules, and safe log summaries.
- **PostgreSQL integration:** authorization, projection FK protection,
  attachment/acceptance/delete races, Finalize/expiration race, unique cleanup
  job, metadata-last deletion, reconciliation, and batch boundaries.
- **Storage/job integration:** fake/filesystem missing object, transient/exhausted
  failures, partial object/DB failures, lease reclaim, safe re-enqueue, staging
  expiration, orphan certainty/uncertainty, and idempotent rerun.
- **Component:** irreversible confirmation, usage refresh, PROCESSING/in-use
  errors, DELETING disabled state, disappearance after completion, EN/FA,
  RTL/LTR, keyboard/focus.
- **E2E:** only the representative safe failure/deletion behavior selected in
  Ticket 10; exhaustive races remain integration tests.
