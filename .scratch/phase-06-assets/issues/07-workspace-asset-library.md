# 07: Deliver the Workspace Asset Library

**What to build:** Give creators a lightweight, localized Workspace surface to
create, find, inspect, rename, preview, and download reusable media without
introducing DAM-scale organization.

**Blocked by:** 05 — Deliver direct HTTPS media ingestion; 06 — Deliver private
Asset preview and download capabilities.

**Status:** ready-for-agent

## Scope

- Add the dedicated authorized Workspace Assets page with Server Component
  initial loading and focused client boundaries.
- Implement flat newest-first pagination, URL-backed search/filter state, safe
  lifecycle polling, cards/rows, empty/loading/error states, and usage counts.
- Add accessible one-file upload and one-link creation experiences backed by
  Tickets 04 and 05.
- Add responsive detail dialog/sheet with safe metadata/provenance, original
  preview, rename, and download.
- Add complete English/Persian localization, LTR/RTL behavior, Unicode/bidi-safe
  names, and responsive/accessibility behavior.

## Architecture and documentation references

- Phase 6 specification ``4, 5, 14, 15, 19, 20, 23, 24 and acceptance criteria
  23–25, 29, 31–35, 38, 39.
- ADR-018 Workspace ownership, reuse, lifecycle, and zero-reference retention.
- ADR-019 private ingestion/access and source-URL privacy.
- ADR-010; PRD `23; Architecture ``6, 40.
- Frontend engineering standards and automated-testing standards.
- AGENTS UI/application boundary, authorization, localization, accessibility,
  security, and scope rules.

## Expected behavior

- The collection is flat, server-paginated at 24 items, ordered newest-created
  first with ID as deterministic tie-breaker.
- URL state carries page, escaped substring search, media type, and lifecycle
  filter with clear reset. Search covers display name and upload-only original
  filename; no external search service is used.
- Cards/rows show display name, type, lifecycle, authoritative size/technical
  metadata when ready, localized Upload or safe source hostname, and
  “Referenced in N contents” from distinct Content IDs.
- PENDING, PROCESSING, READY, FAILED, and DELETING remain visible with localized
  status. Only READY can preview/download. DELETING disappears only after
  metadata hard deletion in Ticket 09.
- Poll relevant lifecycle state every five seconds while visible, back off to 15
  seconds after one minute, and stop on terminal state, close, unmount, or loss
  of relevance. No realtime transport is used.
- READY images may lazily load the managed original when visible. Video/audio
  list items use type placeholders; full native preview lives in the
  detail dialog/sheet.
- Creation accepts one upload or link at a time. A single-file drop target may
  supplement, never replace, the accessible file input.
- Rename changes only display name. Safe source URL is never revealed/opened;
  EXTERNAL_URL shows source hostname only.
- Creator names retain Unicode, valid Persian ZWNJ, and content-driven direction;
  controls isolate bidi text and expose full accessible names.

## Implementation constraints and invariants

- Use Server Components for authorization/initial query and the smallest
  practical Client Components for forms, URL state, polling, preview, and
  mutations.
- Use existing shadcn primitives and React Hook Form + Zod where forms are
  non-trivial. Server/domain validation remains authoritative.
- During implementation/review, actively apply the installed frontend-design,
  vercel-react-best-practices, and web-design-guidelines skills as required by
  frontend standards.
- Owner-only mutations and member reads follow existing roles; client-provided
  Workspace/Asset IDs never prove access.
- Validate display names as 1–200 Unicode code points after outer trim; reject
  NUL, CR/LF, C0/C1 controls, and Bidi_Control while preserving internal Unicode
  and Persian ZWNJ.
- Do not query storage or issue capabilities for off-screen placeholder media
  unnecessarily.

## Explicit non-goals

- Folders, tags, collections, favorites, ratings, comments, bulk actions,
  custom sorting/preferences, Trash, share links, public media, ACLs, quotas,
  deduplication, or analytics.
- Generated thumbnails/posters/waveforms or rich DAM previews.
- Editor attachment/picker behavior (Ticket 08) and deletion implementation
  (Ticket 09). The detail surface may reserve no fake delete behavior.
- Dedicated Asset route; use the approved responsive dialog/sheet.

## Acceptance criteria

- [ ] Authorized reads return only current-Workspace Assets with stable
      newest/ID pagination; cross-Workspace and removed-member access is
      nondisclosing.
- [ ] Search/filter/page state round-trips through the URL, uses bounded escaped
      database queries, and returns deterministic results.
- [ ] Cards/details present exactly the approved lifecycle, metadata, safe
      provenance hostname, and distinct-Content reference count.
- [ ] One-file upload and one-link creation expose progress/failure safely and
      newly created Assets appear in the reusable Workspace Library.
- [ ] Polling follows 5-second/15-second visibility rules and stops without
      leaking timers or adding realtime infrastructure.
- [ ] READY image/video/audio previews and downloads reuse Ticket 06; non-READY
      media cannot acquire capabilities.
- [ ] Rename preserves managed-media identity and Content equality and enforces
      server-authoritative Unicode/bidi rules.
- [ ] Full source URLs, storage keys, signed capabilities, raw failures, and
      private response details are absent from ordinary list/detail UI.
- [ ] English/LTR and Persian/RTL work with Persian, Latin, long, and
      mixed-direction names using keyboard-accessible responsive controls.

## Focused tests

- **Unit/application/PostgreSQL integration:** pagination tie-breaker, search,
  filters, usage count, read/mutation authorization, Unicode validation,
  rename immutability, and safe DTO projection.
- **Component:** URL state, lifecycle polling/backoff/teardown, upload/link
  forms, status announcements, lazy image behavior, native detail preview,
  dialog/sheet focus, download/rename, empty/error states, EN/FA, RTL/LTR, and
  bidi isolation.
- **E2E:** none here; Ticket 10 owns the two representative browser journeys.
- **Manual QA:** deferred to Ticket 10, with focused component accessibility
  review required before this ticket completes.
