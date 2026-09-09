# Phase 6 Assets closure audit

This is the Ticket 10 verification record for the approved Phase 6 scope. It
does not add a product capability or change an accepted ADR.

## Contract and deployment result

- `AssetStorage` remains provider-neutral. The runtime S3 adapter is selected
  only by `ASSET_STORAGE_DRIVER=s3`; no ArvanCloud name or provider identity is
  present in domain persistence.
- The deterministic adapter tests cover exact staging keys, content length,
  private reads, response overrides, range capability, promotion,
  copy-if-absent behavior, managed listing, missing objects, and idempotent
  deletion. The opt-in live suite additionally exercises the provider HTTP
  contract, including anonymous denial, HEAD, signed expiry, range reads, and
  download disposition.
- Live provider execution status for this checkout: `LIVE_PROVIDER_NOT_EXECUTED`.
  No explicit live flag or provider credentials were present. No live pass is
  claimed. The suite is available at
  `src/modules/assets/infrastructure/s3-compatible-asset-storage.live.test.ts`.
- `verifyAssetWorkerDeployment` is a fail-closed gate for Node 24, direct
  Sharp, exact ffprobe path/version, child-process-compatible inspection,
  outbound HTTPS, PostgreSQL, private storage, and writable temporary disk.
  The production runner uses it before claiming work and handles termination
  without starting a new batch after shutdown.
- Deployment requirements, worker cadence, lease recovery, temporary disk,
  logging/alerting, CORS, private bucket policy, and retry/reconciliation
  operations are recorded in `docs/phase-06-assets-deployment.md`.

## Security, privacy, and authorization

The Phase 6 source review and existing focused suites cover workspace-scoped
list/create/finalize/preview/download/attach/rename/delete behavior, owner
mutation policy, member read policy, nondisclosing foreign-resource results,
private staging, exact-object capabilities, and READY-only access. External
URL acquisition retains HTTPS/standard-port/no-userinfo validation, manual
redirect revalidation, DNS/address binding, original-host TLS/SNI, bounded
timeouts/headers, streaming byte ceilings, and no credential/cookie
forwarding. Media inspection retains the strict allowlist, bounded Sharp and
ffprobe execution, fixed arguments, and no shell invocation.

Capability URLs are generated on demand, expire after 900 seconds, are
private/no-store, and are not persisted. READY preview uses the permanent
object key, never `sourceUrl`. The structured logger allowlist excludes URLs,
credentials, storage keys, creator names, Content text, media bytes, remote
responses, and raw inspector output. Storage secrets are rejected when
presented as `NEXT_PUBLIC_*`; production versioning must be explicitly
declared `disabled`.

Deletion remains reference-safe and object-first: surviving Draft/Version
references block deletion, uncertain orphan ownership is retained, and
metadata is removed only after object cleanup is confirmed.

## Migration and lineage result

The sequential Drizzle journal through `0015_asset_deletion_evidence` was
reviewed from the Phase 5 baseline. Phase 6 migrations `0010` through `0015`
are additive table/constraint/index/column changes; they contain no
object-storage operations and no historical migration was rewritten by Ticket
10. Existing accepted-version pointers and V1/V2 JSON are untouched. The
composite workspace/resource foreign keys, reference shape checks, asset/job
state checks, deletion evidence, and derived `asset_references` projection
remain coherent.

The authoritative lineage remains:

```text
Workspace → Asset
Content Draft V3 → assetId
immutable Content Version V3 → assetId
acceptedVersionId → exact Version → exact Asset references
asset_references → derived projection only
```

Ticket 10 also closed the read-path gap found during verification: resulting
Content details returned from generation-attempt history now load the same
`assetPresentations` projection as the primary Content detail path, preserving
attachment metadata through recovery/history reads.

## UI, localization, and representative journeys

The Phase 6 Library, detail dialog, creation forms, preview/download controls,
editor picker, lifecycle/error states, and deletion confirmation were reviewed
for semantic controls, labels, focus visibility, focus restoration, keyboard
operation, responsive layout, logical direction, bidi-safe display names, and
non-mirrored native media. Existing component tests cover the EN/FA and
management states; the new E2E file contains exactly two deterministic
persisted journeys: EN/LTR upload through acceptance/history, and FA/RTL
mixed-direction management through preview and safe deletion.

Manual QA record: the representative desktop/mobile, long/mixed-direction,
keyboard/focus, Library/detail/picker, native media, and interrupted-processing
checklist was reviewed against the rendered components and their loading/error
states. Full browser execution of the new journeys was attempted, but the
repository's known pre-existing Better Auth schema mismatch (`account.issuer`)
prevented the E2E web server from becoming ready; this is unrelated to the
Phase 6 storage, worker, or UI changes and is reported as an environment
warning rather than a fabricated E2E pass.

## Scope audit

No Phase 6 code introduces Content deletion, AI or stock media, folders/tags/
collections, bulk operations, quotas/billing, deduplication, transcoding,
derivatives, thumbnails/posters/waveforms, timeline editing, public sharing,
permanent public URLs, Redis/message brokers, or a media-processing service.
The implementation continues to use the approved PostgreSQL job runner and
provider-neutral storage boundary.

## Validation record

The final command results are recorded in the Ticket 10 comments. Normal CI
does not require live ArvanCloud; the live status above is intentionally
separate from deterministic CI.
