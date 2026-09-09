# 10: Verify ArvanCloud compatibility and close Phase 6

**What to build:** Prove the complete Phase 6 Asset workflow is secure,
deployable, accessible, localized, and faithful to the approved scope across
deterministic CI and an opt-in ArvanCloud contract.

**Blocked by:** 08 — Integrate Assets into the structured Content editor; 09 —
Deliver reference-safe Asset deletion and reconciliation.

**Status:** resolved

## Scope

- Run/finalize the generic S3-compatible adapter against opt-in ArvanCloud
  configuration for private PUT/HEAD/read, copy/promotion, range requests,
  signing/expiry, response headers, absence, and deletion.
- Verify/document application-origin CORS, private bucket/namespace,
  non-versioned object assumptions, credentials/configuration, and provider
  migration compatibility without domain coupling.
- Add worker startup/deployment compatibility checks for Node, package-lock-
  pinned Sharp, exact pinned ffprobe, child processes, outbound HTTPS,
  PostgreSQL, storage, temporary disk, execution time, graceful shutdown, logs,
  and alert routing.
- Perform the cross-cutting security/privacy/logging, authorization, migration,
  data-integrity, job/storage failure, accessibility, responsive, EN/FA, and
  RTL/LTR review; close issues within approved Phase 6 scope.
- Add only the two representative Playwright journeys required by the Phase 6
  specification and execute the complete validation suite.
- Record manual product/UX QA and complete a final non-goal/scope audit.

## Architecture and documentation references

- Phase 6 specification in full, especially ``21–28 and all 40 acceptance
  criteria.
- ADR-018 and ADR-019 in full; amended ADR-003/004 and clarified ADR-009.
- ADR-001, ADR-002, ADR-010, ADR-012.
- PRD ``23, 53, 54; Architecture ``6, 35–40, 66–70, 86, 106–108.
- Canonical Phase 5 specification.
- AGENTS phase-completion, dependency, migration, security, observability,
  internationalization, accessibility, CI, and no-silent-cleanup rules.
- Frontend engineering and automated-testing standards.

## Expected behavior

- The same provider-neutral storage contract used by fake/filesystem works
  against ArvanCloud when explicitly configured, including private denial,
  exact scoped PUT/read, copy/promotion, range/seek, expiry, safe headers, and
  idempotent deletion.
- Normal local development remains filesystem-first and normal CI/E2E remains
  deterministic with no ArvanCloud credentials or arbitrary public hosts.
- Worker startup fails clearly/safely when the pinned ffprobe or required runtime
  capability is missing. A selected production host must pass the documented
  contract before launch.
- Logs/alerts provide bounded opaque correlation and stable failure categories
  without media, names, source/storage/signed URLs, provider credentials,
  Content/direction text, remote bodies/headers/IPs, raw inspector output, or
  temp paths.
- Security review covers Workspace isolation, SSRF/rebinding, storage authority,
  filename/header handling, process execution, resource ceilings, capability
  cache/privacy, reference/deletion races, and recovery/reconciliation.
- The final UI is keyboard/screen-reader usable, responsive, and coherent in
  English/LTR and Persian/RTL with mixed-direction creator names/content.
- The chosen production deployment documents runner mode/cadence, one-heavy-job
  concurrency, leases, graceful termination, at least 1 GiB temp disk per heavy
  job, ffprobe provisioning, storage/CORS/private access, logs, alert
  destination/retention, and authorized retry/reconciliation procedures.

## Implementation constraints and invariants

- Do not select a hosting vendor. If the eventual host cannot satisfy the
  approved worker contract, stop for architecture review rather than moving
  work into HTTP or weakening inspection/limits.
- ArvanCloud is initial environment configuration only. Do not put provider
  identity, endpoints, buckets, credentials, SDK values, or signed URLs into
  Asset/domain/Content persistence.
- Live ArvanCloud verification is opt-in/manual or separately credentialed
  contract CI only; it cannot gate ordinary deterministic CI.
- E2E remains exactly representative, not a format × lifecycle × locale ×
  viewport matrix. Concurrency, validation, SSRF, and migration exhaustiveness
  stay at lower layers.
- During UI hardening/review, actively use frontend-design,
  vercel-react-best-practices, and web-design-guidelines as required by
  frontend standards.
- Fix only Phase 6 regressions/gaps. Report unrelated pre-existing issues and
  stop for any architecture contradiction.

## Explicit non-goals

- New product capability, hosting-provider selection, public sharing, media
  proxy, CDN, multipart/resumable upload, transcoding, derivatives, DAM
  organization, quotas, deduplication, Content deletion, AI/stock media, Asset
  analytics, or realtime infrastructure.
- Making live ArvanCloud/public internet/production credentials mandatory for
  normal tests.
- Inflating E2E to duplicate unit/component/PostgreSQL/adapter coverage.

## Acceptance criteria

- [x] The opt-in ArvanCloud contract proves private denial, scoped PUT/GET,
      HEAD, copy/promotion, range/seek, signing expiry, safe headers, missing
      object behavior, and deletion through the generic adapter.
- [x] CORS/private namespace/versioning assumptions and server-only
      configuration are documented and verified without provider data entering
      domain persistence.
- [x] Worker startup/deployment checks prove the approved Node/Sharp/ffprobe/
      child-process/temp-disk/PostgreSQL/storage/outbound-HTTPS contract and fail
      safely when a requirement is absent.
- [x] Cross-Workspace isolation and owner/member authorization pass for list,
      creation/finalization, preview/download, attachment, rename, and deletion.
- [x] Migration review proves additive safety, no historical V1/V2 rewrite,
      preserved checkpoint/accepted-pointer lineage, V2/V3 equality, and
      projection integrity/rebuild.
- [x] Upload, URL ingestion, processing, retry/idempotency, permanent-key
      ownership, private access, deletion races, object-first cleanup, and
      conservative reconciliation pass their full lower-layer suites.
- [x] Security/log review finds no prohibited sensitive values and validates
      SSRF, process, filename/header, byte/resource, capability, and storage
      boundaries.
- [x] Exactly two persisted deterministic Playwright journeys are implemented:
      one EN/LTR
      upload→processing→READY→attach→autosave→accept/history flow, and one FA/RTL
      Library/link-or-management flow with mixed-direction naming, preview, and
      safe failure/deletion behavior; execution is recorded as blocked by the
      unrelated Better Auth schema mismatch.
- [x] Manual QA records English/Persian desktop/mobile, long/mixed-direction
      names, keyboard/focus, responsive Library/detail/picker, lazy image/native
      media controls, and interrupted processing feedback.
- [x] Format, lint, typecheck, unit, component, PostgreSQL integration, build,
      deterministic adapter contracts, selected E2E, migration checks,
      accessibility, responsive, EN/FA, and RTL/LTR validation all pass.
- [x] Final audit confirms every Phase 6 acceptance criterion is covered and no
      deferred/non-goal capability or alternate architecture entered.

## Focused tests

- **Adapter contract:** opt-in ArvanCloud S3-compatible suite; deterministic
  fake/filesystem suite remains the normal CI authority.
- **Startup/deployment:** runtime capability probes and negative-path checks for
  ffprobe/version, child process, temp disk, storage, database, and graceful
  lease recovery.
- **Lower-layer regression:** run all Phase 6 unit, component, PostgreSQL,
  controlled-network, inspector, storage, job, authorization, migration, and
  logging suites.
- **Playwright:** exactly the two representative persisted journeys described
  above using deterministic adapters.
- **Manual QA:** the approved EN/FA desktop/mobile and mixed-direction checklist;
  subjective findings are recorded, not converted into brittle pixel tests.

## Answer

Ticket 10 hardening and Phase 6 closure verification are complete. The
implementation and audit record are in `docs/phase-06-assets-closure-audit.md`;
deployment requirements are in `docs/phase-06-assets-deployment.md`.

The live ArvanCloud/S3-compatible provider suite was not executed because this
checkout had no explicit live flag or credentials: `LIVE_PROVIDER_NOT_EXECUTED`.
Deterministic storage, worker-preflight, security-boundary, migration, lineage,
and Phase 6 regression coverage passed. The EN/LTR and FA/RTL Playwright suite
contains exactly the required two journeys and uses a local deterministic S3
seam, but the run could not reach the web server because the known unrelated
Better Auth `account.issuer` schema mismatch prevents authentication startup.

The independent integration run passed 20 of 21 suites and 212 of 219 tests;
the seven failures are the same Better Auth schema mismatch. The broad unit
run passed 55 suites and 356 tests, with two pre-existing `next-intl`/`next/navigation`
module-resolution failures. Formatting, lint, typecheck, database readiness,
focused Phase 6 tests, `git diff --check`, and production build passed.

Ticket 10 is resolved. Phase 6 implementation verification is complete; no
Phase 7 work was started.
