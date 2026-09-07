# 05: Deliver direct HTTPS media ingestion

**What to build:** Let an authorized Workspace owner submit a direct public
HTTPS media URL and receive an immutable managed Asset without allowing remote
hosts, redirects, or DNS behavior to cross the private-network boundary.

**Blocked by:** 04 — Deliver the direct upload lifecycle.

**Status:** ready-for-agent

## Scope

- Implement EXTERNAL_URL Asset creation, immutable normalized plaintext
  `sourceUrl`/safe `sourceHost` persistence, admission, and job enqueue.
- Implement a controlled server-side HTTPS retrieval adapter with manual
  redirects, public-address validation, rebinding-safe connection behavior,
  bounded headers/timeouts, and streamed per-media byte ceilings.
- Stage retrieved media and reuse the common inspection, permanent-key
  reservation, promotion, permanent reinspection, lifecycle, retry, and cleanup
  pipeline from Ticket 04.
- Add safe creator-facing creation guidance that submission implies the creator
  has usage rights but does not claim rights verification.

## Architecture and documentation references

- Phase 6 specification ``5, 9, 11–13, 18, 19, 21, 23–25 and acceptance
  criteria 17–22, 23, 35–40.
- ADR-019 external URL ingestion, inspection/promotion, execution, privacy, and
  recovery decisions.
- ADR-018 source/Asset identity and lifecycle.
- ADR-009 job identity and retry boundaries.
- PRD ``23, 54; Architecture ``40, 48, 69, 86.
- AGENTS SSRF, external API, transactions, authorization, logging, security,
  and validation rules.

## Expected behavior

- Creation accepts one declared IMAGE/VIDEO/AUDIO direct HTTPS URL no longer
  than 4,096 UTF-8 bytes. It stores a normalized fragment-free plaintext URL
  and lowercase ASCII/punycode hostname without credentials or port.
- Only standard-port, public, unauthenticated HTTPS is eligible. Reject
  userinfo, HTTP downgrade, non-HTTPS, custom headers, cookies, OAuth/basic
  authentication, browser sessions, and interactive login.
- The worker follows at most three redirects manually. It re-parses, resolves,
  and validates every hop; automatic redirect following is disabled.
- Any resolution to loopback, private, link-local, carrier-grade NAT, multicast,
  unspecified, reserved/non-routable, documentation/test, metadata-service, or
  IPv4-mapped prohibited IPv6 addresses is rejected.
- The actual connection is bound to an approved public resolution or receives
  equivalent rebinding protection while retaining correct TLS hostname
  verification.
- Retrieval forwards no creator/application credentials, bounds DNS/connect/
  header/idle/total time and response headers, rejects trustworthy oversized
  Content-Length early, and always enforces a streamed byte ceiling.
- The final response must be direct allowlisted media, not HTML, a hosted-media
  page, social post, sign-in page, or arbitrary download.
- READY always previews the immutable managed copy. It is never hotlinked,
  refetched, synchronized, or changed when the source changes/disappears.

## Implementation constraints and invariants

- Acquisition is source-specific only until media is present in managed staging
  storage. From that boundary onward, EXTERNAL_URL and UPLOAD must use the same
  shared pipeline for authoritative inspection, `permanentStorageKey`
  reservation, promotion, permanent-object validation, READY metadata
  persistence, retry/idempotency, terminal failure handling, and staging
  cleanup. Do not duplicate this pipeline by source type.
- `sourceUrl` is normal private plaintext application data. Do not add
  encryption keys, ciphertext columns, URL reveal/open controls, or ADR-008
  credential machinery.
- Full source URL must be absent from Content, Versions, reference rows, jobs,
  recovery output, list/detail DTOs, logs, errors, analytics, and browser
  responses. Only safe `sourceHost` is creator-facing.
- The job payload contains Asset ID only and reloads authoritative state.
- Do not use plain automatic `fetch(userUrl)`. The controlled network seam must
  be injectable so tests use deterministic DNS/HTTP fixtures rather than public
  hosts.
- Do not hold a database transaction while resolving or downloading.
- Remote headers/extension are hints only. Actual staged/permanent media and
  declared media type determine READY eligibility.

## Explicit non-goals

- YouTube/Vimeo/social-page extraction, oEmbed, HTML parsing, Drive/Dropbox,
  OAuth, cookies, credentials, custom headers, nonstandard ports, authenticated
  media, background synchronization, or full-URL reveal/open.
- New source types, remote media proxying, transcoding, rights/copyright
  verification, antivirus/moderation, or arbitrary internet access in CI.
- Library/picker presentation beyond reusable creation guidance; Ticket 07 owns
  the complete surface.

## Acceptance criteria

- [ ] Valid direct HTTPS fixtures create one PENDING EXTERNAL_URL Asset, persist
      normalized private provenance, enqueue one logical ingestion job, and
      become READY through the shared managed-media pipeline.
- [ ] The initial target and every redirect enforce scheme/port/userinfo/
      credential rules, the three-redirect maximum, DNS/public-IP policy, TLS
      hostname verification, and rebinding-safe connection behavior.
- [ ] IPv4, IPv6, IPv4-mapped IPv6, mixed public/prohibited DNS answers, and
      metadata/private-network destinations are rejected without making an
      unsafe connection.
- [ ] Timeouts, header bounds, early Content-Length checks, streaming byte
      ceilings, non-media/HTML responses, and remote interruption fail safely
      without unbounded memory/disk use.
- [ ] Transient remote/infrastructure failures retry boundedly; deterministic
      security/validation failures do not retry; terminal output uses stable
      localized-safe failure categories.
- [ ] READY media remains the managed snapshot when the remote fixture changes
      or disappears and no READY workflow refetches it.
- [ ] Full source URL cannot appear in job payloads, DTOs, Content/Versions,
      recovery output, logs, or creator-facing errors.
- [ ] Cross-Workspace and non-owner creation attempts fail through established
      nondisclosing authorization behavior.

## Focused tests

- **Unit/domain:** URL normalization, UTF-8 length, hostname/punycode, scheme/
  port/userinfo rules, redirect count, address classification for IPv4/IPv6,
  and stable failure mapping.
- **Controlled network contract/integration:** deterministic DNS + HTTPS server
  for rebinding, mixed answers, redirects, downgrade, TLS host, credentials,
  timeouts, headers, streamed overflow, HTML/non-media, interruption, and
  snapshot immutability.
- **PostgreSQL integration:** creation/admission authorization, immutable
  provenance, job idempotency/retry, and absence of source URL from projections.
- **E2E:** none; representative link/management behavior belongs to Ticket 10.
