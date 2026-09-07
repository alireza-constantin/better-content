# 06: Deliver private Asset preview and download capabilities

**What to build:** Let authorized Workspace members preview or download one
READY managed Asset through a short-lived private capability without exposing
storage authority or proxying media through the application.

**Blocked by:** 04 — Deliver the direct upload lifecycle.

**Status:** ready-for-agent

## Scope

- Implement READY-only preview/download authorization and object-specific
  15-minute read capabilities through `AssetStorage`.
- Implement authoritative MIME, safe inline/download content disposition,
  private/no-store behavior, and the storage range/seek contract.
- Add reusable image preview and native video/audio player boundaries, including
  just-in-time capability acquisition and active-player refresh.
- Add safe access/error logging and ensure capabilities do not enter persistence,
  DTO caches, Content, recovery output, or telemetry.

## Architecture and documentation references

- Phase 6 specification ``9, 13, 14, 19–21, 23–25 and acceptance criteria
  23–25, 31–34, 38–40.
- ADR-019 private storage and preview/download decisions.
- ADR-018 READY lifecycle and Workspace ownership.
- ADR-002 Workspace authorization; ADR-010 EN/FA and directionality.
- Architecture ``6, 40, 77–86.
- Frontend engineering and automated-testing standards.

## Expected behavior

- Every capability request freshly authenticates the user, proves current
  Workspace membership and Asset ownership, reloads status, and permits only
  READY.
- A capability addresses exactly one permanent object and one operation for 15
  minutes. It cannot list, upload, promote, delete, or address another Asset.
- Preview uses authoritative detected MIME and safe inline disposition where
  applicable. Download uses a fresh capability and a bidi/header-safe filename
  derived from display name plus canonical extension.
- READY IMAGE uses the validated original in an image preview. READY VIDEO and
  AUDIO use native controls and storage range requests; no application media
  proxy is introduced.
- Images acquire access lazily/just in time and require no proactive refresh
  after load. Active video/audio refreshes authorization about 90 seconds before
  expiry, stops when inactive/unmounted, and preserves basic playback position
  where technically practical.
- Refresh failure stops new media requests and presents a localized retry/access
  state. Previously issued capabilities remain valid only until provider expiry;
  no revocation database is added.
- PENDING, PROCESSING, FAILED, and DELETING never receive new preview/download
  capabilities.

## Implementation constraints and invariants

- Buckets/objects remain private. Knowledge of a storage key or Asset ID is not
  authorization.
- Persist or cache no signed URL, signature/query parameters, or temporary
  capability. Responses and UI state use private/no-store behavior and browser
  memory only.
- Use safe authoritative response headers, `X-Content-Type-Options: nosniff`
  where supported, ASCII filename fallback, and UTF-8 `filename*`. Never
  interpolate raw creator text into headers.
- Browser components own only presentation/playback state. Authorization,
  lifecycle, disposition, and object scope remain application/storage concerns.
- Preserve semantic labels, keyboard access, focus, reduced-motion expectations,
  and EN/FA LTR/RTL behavior.

## Explicit non-goals

- Public URLs/sharing, CDN delivery, ACLs/guests, permanent access tokens,
  revocation tables, cookies as media authority, application media proxying, or
  public caching.
- Generated thumbnails/posters/waveforms, alternate renditions, transcoding,
  media editing, or Library/picker composition.
- Live ArvanCloud verification; Ticket 10 owns the opt-in provider contract.

## Acceptance criteria

- [ ] Current authorized Workspace members can obtain one 15-minute capability
      for one READY Asset/operation; foreign, unauthenticated, removed-member,
      non-READY, and key-guessing attempts fail without disclosure.
- [ ] Capabilities cannot list or mutate storage and cannot address another
      object's key.
- [ ] Image, native video, and native audio presentation uses authoritative MIME,
      safe headers, and private/no-store handling.
- [ ] Range/seek behavior is represented in the storage contract and works
      through deterministic adapter coverage.
- [ ] Active video/audio refresh reauthorizes about 90 seconds before expiry,
      stops when irrelevant, handles expiry safely, and preserves practical
      playback state.
- [ ] Download creates a fresh capability and safe ASCII/UTF-8 disposition
      filename without mutating stored display name.
- [ ] Signed URLs/parameters do not appear in PostgreSQL, Content, recovery
      output, server/client caches, or structured logs.
- [ ] DELETING or membership removal prevents all newly issued capabilities.

## Focused tests

- **Unit/application:** authorization/status matrix, capability scope/lifetime,
  disposition encoding, canonical extensions, error mapping, and no-store DTO
  behavior.
- **Component:** image lazy acquisition, video/audio refresh timing and teardown,
  playback recovery, localized access failures, keyboard/labels, and mixed-bidi
  filename presentation.
- **Adapter contract:** private denial, object/operation scope, range semantics,
  expiry simulation, authoritative headers, and deletion/missing-object errors
  against fake/filesystem.
- **E2E:** none; representative persisted preview/download behavior belongs to
  Ticket 10.
