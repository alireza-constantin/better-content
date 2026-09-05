# 13 — Add Content Production Queue and Idea-to-Content workflow

**What to build:** Make the existing Content product the creator's production
workspace. It must provide a derived, prioritized Production Queue for
Accepted Ideas with no linked Content, a Generated Content Library, narrow
source-Idea filtering, Generate Another, and compact generation activity and
retry while reusing the established generation workflow.

**Blocked by:** 12 — Add unified workspace-wide Idea Library filters and compact cards.

**Status:** resolved

## Goal

The Idea Library remains the decision surface. The primary production flow is:

```text
Idea Library
  → Accept
  → Content Production Queue
  → prioritize
  → Generate
  → Generated Content Library / Script editor
```

The Content surface remains one product and conceptually contains:

1. Production Queue;
2. Generated Content Library;
3. a narrow source-Idea Content filter;
4. compact generation activity and retry.

Do not create a new top-level Queue product or a second generation
orchestration path.

## Queue membership and Idea semantics

Queue membership is derived and must not be persisted:

```text
isQueued = Idea.status == ACCEPTED && linkedContentCount == 0
```

Persisted Idea states remain exactly `NEW`, `SAVED`, `ACCEPTED`, and
`REJECTED`. Do not add `QUEUED`, `DONE`, `PRODUCED`, `COMPLETED`, or another
production lifecycle state. `USED`, Content existence, and Content count
remain derived and are not persisted.

The queue must derive membership from Accepted status plus zero linked Content,
never from queue position. In valid application-created state:

```text
queued Idea      → productionQueuePosition is positive
non-queued Idea  → productionQueuePosition is NULL
```

## Queue ordering and migration

Persist only the ordering metadata on the existing Idea aggregate using the
ADR-017 model: a nullable positive integer `productionQueuePosition`. Do not
add `workspaceId` to Idea, a queue membership column, persisted counts, a
ContentQueue table, or another queue aggregate.

Ticket 13 owns the reviewed Drizzle migration required by ADR-017. Add the
nullable positive integer field and backfill only existing `ACCEPTED` Ideas
with zero linked Content. Do not infer historical acceptance time from
`statusChangedAt`.

Use this deterministic initial seed within each workspace:

1. Generation Batch creation order;
2. Idea position within the Batch;
3. stable Idea ID tie-breaker.

Assign positions `1..N`. Document that this is only the initial queue seed and
does not represent historical creator priority. After migration,
creator-controlled ordering is authoritative.

## Workspace-scoped serialization

Every mutation that assigns, clears, or rewrites a Production Queue position
must use the same workspace-scoped transactional serialization boundary:

1. authorize the current workspace;
2. acquire the authorized workspace row with `FOR UPDATE`;
3. lock or verify operation-specific domain rows in the repository-consistent
   deterministic order;
4. derive and mutate authoritative queue state;
5. commit atomically.

The workspace row must be acquired before any Idea, Generation Batch, AI Run,
Content, Draft, Version, or quota rows needed by the operation. Provider calls
must remain outside this short transaction.

Do not introduce Redis locks, distributed locks, a queue table solely for
locking, fractional indexing, LexoRank, or CRDT/collaborative ordering. If
implementation reveals a genuine conflict with the established lock order,
stop and escalate it instead of silently inventing another lock architecture.

## Queue entry

When an Idea transitions into `ACCEPTED` with zero linked Content, it becomes
queued. While holding the workspace serialization boundary:

1. authorize the Idea through `Idea → Generation Batch → Workspace`;
2. verify that the transition makes it newly queue-eligible;
3. derive/load the authoritative current queue;
4. append the Idea after the current final queued Idea;
5. assign a distinct positive integer position;
6. commit.

Concurrent newly queued Ideas must receive distinct valid positions. The
relative order of truly simultaneous accepts has no product meaning.

## Queue exit

When a queued Idea ceases to satisfy derived membership because of
`ACCEPTED → SAVED`, `ACCEPTED → REJECTED`, first successful Content creation,
or another established transition, use the same workspace serialization
boundary and clear:

```text
productionQueuePosition = NULL
```

Keep remaining positions valid and deterministic according to ADR-017. Do not
create a persistent queue-completion state. A failed generation leaves status
Accepted and Content count zero, so the Idea remains queued and its position
remains intact.

## Reorder

Creators can reorder the modest V1 queue using simple integer positions. The
client may submit the complete authoritative ordered Idea ID list.

While holding the workspace serialization boundary, the server must:

1. derive the authoritative current queue;
2. verify submitted IDs exactly match current queue membership;
3. reject duplicate IDs;
4. reject missing IDs;
5. reject stale membership;
6. reject foreign IDs nondisclosingly;
7. transactionally rewrite positions `1..N`.

Any mismatch returns stable `CONFLICT`. There is no partial reorder,
last-write-wins behavior, automatic merge, or collaborative ordering.

## Content page and queue item UX

The existing Content product becomes the production workspace. A queue item
may show compact useful information including Idea title, short description,
Idea language, priority, safe last-generation failure state, Generate, and
Retry where applicable. Queue items must not become Attempt audit logs.

Prioritization must support mouse and touch drag-and-drop plus an accessible
keyboard-operable equivalent such as Move up and Move down. Screen-reader
users must be able to understand position, movement, status, and errors.
Drag-and-drop must not be the only reorder mechanism. Use an existing
compatible sortable dependency only if implementation proves one is needed;
do not select a complex ordering library in this ticket specification.

Persisted ordering must survive refresh, navigation, logout/login, and later
sessions. Queue reorder must remain logical in both LTR and RTL layouts.

## First generation and Ticket 06 integration

The primary first-generation flow lives in the Production Queue:

```text
Queue item
  → Generate
  → existing Ticket 09 Generate Script form/action
  → Ticket 05 acceptance
  → Ticket 06 execution
  → Content / Draft / Version #1 / AI Run completion
  → Ticket 10 editor
```

Reuse Ticket 09’s existing form, action, feedback, and generation capability.
Do not create a second form or orchestration path. UI code must not create
Content directly.

First successful Content creation changes derived queue membership. The Ticket
06 successful transaction must preserve its existing atomic invariant:

```text
Content + Draft + Version #1 + AI Run completion + Attempt completion
```

and, when the source Idea was queued, also clear
`productionQueuePosition` in that same transaction. The completion transaction
must acquire the workspace serialization point before generation/domain row
locks. Do not split or weaken Ticket 06 atomic success. Provider execution
remains outside the transaction.

## Failed generation and retry

If generation fails:

- status remains `ACCEPTED`;
- linked Content count remains zero;
- `productionQueuePosition` remains intact;
- the Idea remains in the queue;
- the durable failed Attempt remains discoverable.

The queue may show a compact safe failure state. Retry must reuse the existing
Ticket 07 retry application path and Ticket 09 capability. Do not add
queue-specific retry orchestration. Successful Retry creates a distinct
Content aggregate and exits the initial queue through the same derived rule.

## Content Library and source-Idea filter

Preserve Ticket 10 Content list/editor behavior and add only the narrow
source-Idea filter, conceptually:

```text
/content?ideaId=<idea-id>
```

The filtered view must support zero, one, or multiple linked Content records;
source Idea context; generated Content entries; editor links; compact
Generation activity; and Generate Another for an eligible Accepted Idea.

Content count and Content existence remain derived. The filter must verify
Idea/Content ownership through the workspace relationship and must not reveal
foreign Idea or Content existence.

An Accepted Idea with linked Content is no longer in the initial queue but
remains eligible to Generate Another from the filtered Content context. This
creates another distinct Content aggregate from the same Idea. Do not
implement Content regeneration, Draft rewrite, AI editing, or SDK retry.

## Idea Library relationship

Integrate with Ticket 12’s compact unified Idea Library; do not redesign it.

- `ACCEPTED` + zero Content may show localized **In content queue** or
  equivalent.
- `ACCEPTED` + linked Content may show a compact derived Content count/link,
  for example `2 Contents →`.
- The link should navigate to the source-Idea Content view when the route is
  available.
- Do not restore full Attempt history to Idea cards.
- Do not make every Accepted Idea card the primary first-generation UI again.

Attempt history remains durable and accessible in the Content/production
context through existing Ticket 07 DTOs/services where possible. Do not
duplicate Attempt read or retry semantics.

## Authorization, localization, and accessibility

Queue reads require current workspace membership. Queue reorder and generation
mutations use the established V1 owner policy. Every Idea must be authorized
through `Idea → Generation Batch → Workspace`; submitted ordered IDs are not
ownership proof; foreign IDs remain nondisclosing.

All visible strings use `next-intl`. Verify English/LTR and Persian/RTL,
logical reorder behavior in RTL, independent Idea/Content language, preserved
mixed Persian/English creator text, visible focus, accessible status/error
announcements, safe `CONFLICT` feedback, touch targets, and no state conveyed
by color alone. Verify representative desktop, tablet/narrow, and mobile
layouts without horizontal overflow.

## Acceptance criteria

- [x] A reviewed migration adds nullable positive-integer queue ordering and
      deterministically seeds only existing Accepted, zero-Content Ideas using
      Batch creation order, Idea position, and stable Idea ID; it does not use
      `statusChangedAt` as historical acceptance time.
- [x] No queue status, queue membership column, queue membership table,
      persisted Content count, persisted `hasContent`, or persisted `USED` is
      introduced; Idea states remain exactly NEW/SAVED/ACCEPTED/REJECTED.
- [x] Queue membership is derived exactly from Accepted status plus zero linked
      Content and never from queue position.
- [x] A newly Accepted zero-Content Idea appends at the end with a distinct
      positive position; re-accepting such an Idea appends again; re-accepting
      an Idea with Content does not queue it.
- [x] Save, Reject, and first successful Content clear queue position and keep
      remaining positions valid; failed generation leaves queue membership and
      position intact.
- [x] Every queue-position assignment, clear, and rewrite uses the authorized
      workspace-row serialization boundary with workspace-first lock order.
- [x] Reorder verifies the exact current queue member set, rejects duplicate,
      missing, stale, and foreign IDs safely with `CONFLICT`, assigns positions
      `1..N` transactionally, and never partially applies.
- [x] Concurrent queue mutations cannot commit duplicate positions and valid
      non-queued Ideas end with `NULL` position.
- [x] Queue order persists across refresh, navigation, logout/login, and later
      sessions.
- [x] Queue generation reuses Ticket 09, Ticket 05, and Ticket 06; no second
      generation orchestration exists; first successful Content clears queue
      position within the Ticket 06 atomic success transaction.
- [x] Failed generation remains queued and retry delegates to the existing
      Ticket 07/Ticket 09 path.
- [x] Content supports the Generated Content Library, narrow source-Idea
      filtering for zero/one/multiple Content, editor links, compact activity,
      and Generate Another for an eligible Accepted Idea.
- [x] Ticket 12’s compact Idea cards show derived queue/Content state without
      inline full Attempt history or primary first-generation Generate UI.
- [x] Authorization and nondisclosure are proven for queue reads, reorder,
      generation, retries, and source-Idea filtering.
- [x] EN/FA, LTR/RTL, responsive, keyboard, screen-reader, touch, focus,
      status, and conflict behavior meet the documented requirements.

## Required tests

### Migration and persistence

- queue-position migration and positive/null constraint behavior;
- deterministic per-workspace backfill;
- only Accepted + zero Content Ideas are backfilled;
- Ideas with Content and NEW/SAVED/REJECTED Ideas receive `NULL`;
- persisted order survives reload and a new session.

### Membership and entry/exit

- Accepted + zero Content appears;
- Accepted + one or multiple Content does not;
- New, Saved, and Rejected do not;
- position alone does not create membership;
- Accept appends to end;
- re-accept zero-Content appends to end;
- re-accept with Content does not enter;
- Accepted → Saved and Accepted → Rejected clear position;
- first successful Content clears position atomically;
- failed generation leaves position unchanged.

### Reorder and concurrency

- valid reorder rewrites `1..N`;
- duplicate, missing, stale, and foreign IDs return `CONFLICT` safely;
- no partial reorder occurs;
- Accept + Accept;
- Accept + reorder;
- Save + reorder;
- Reject + reorder;
- first Content completion + reorder;
- queue generation + reorder;
- simultaneous successful operations cannot create duplicate positions;
- positions remain unique, positive, and valid after all successful mutations;
- non-queued Ideas end with `NULL` position.

### Ticket 06 integration

- successful first generation preserves Content/Draft/Version #1/AI Run/Attempt
  atomicity while clearing queue position;
- rollback leaves queue position and artifacts consistent;
- provider failure leaves queue membership/order intact;
- late-result and stale-recovery behavior remains correct.

### Content, activity, and E2E

- source-Idea filter with zero, one, and multiple Content;
- Generate Another creates another distinct Content aggregate;
- failed Attempt is visible in production context and Retry delegates to the
  existing path;
- no expanded Attempt history returns to Idea cards;
- deterministic E2E is limited to critical wiring journeys: Accept Idea →
  Production Queue; persisted mouse/keyboard reorder; Generate next → real
  editor and queue advance; failed generation → Retry → editor;
  Content-by-Idea → Generate Another; and one Persian/RTL production journey.
  Combine coherent journeys where that reduces duplication. Do not create an
  acceptance-criterion-per-test browser matrix.
- authorization/nondisclosure, membership/exit rules, validation boundaries,
  queue conflicts and races, source-Idea cardinality, locale semantics, and
  responsive/visual permutations remain mandatory but are proved through the
  unit, component, PostgreSQL integration, and manual-QA layers specified in
  `docs/agents/testing-standards.md`.

No live provider call is required for this ticket’s deterministic tests.

## Implementation report

1. **Files changed:** Added the reviewed queue migration and migration test;
   queue repository/service/actions; Content-by-Idea read model and service;
   Production Queue and source-Idea Content context components; and queue,
   library, route, Idea Library, localization, integration, and browser-test
   updates. Existing Ticket 06, Ticket 07, Ticket 09, and Ticket 10 seams were
   extended rather than duplicated.
2. **Migration/backfill:** `production_queue_position` is nullable with a
   positive-value check. The migration backfills only `ACCEPTED` Ideas with no
   linked Content, partitioned by workspace and ordered by batch creation time,
   Idea position, and stable Idea ID. It does not consult `status_changed_at`.
3. **Queue read architecture:** Membership is a workspace-provenanced query
   of `ACCEPTED` plus `count(contents.id) = 0`; position alone never creates a
   member. The DTO exposes only safe Idea fields, positive ordering metadata,
   and compact latest-attempt state.
4. **Workspace-lock implementation:** Queue mutations authorize first, lock
   the workspace row with `FOR UPDATE`, lock workspace Ideas in stable ID
   order, derive authoritative membership, then assign/clear/normalize or
   rewrite positions in the same transaction. Ticket 06 completion acquires
   this boundary before generation/domain locks. The pre-existing advisory
   lock remains only for unrelated default-workspace provisioning and Idea
   generation behavior.
5. **Entry/exit/reorder:** Accept appends an eligible zero-Content Idea;
   re-accepting one with Content does not queue it. Save, Reject, and first
   successful Content clear the position and normalize remaining members.
   Reorder requires an exact current member set and returns `CONFLICT` for
   duplicates, missing/stale/foreign IDs without partial application.
6. **Ticket 06 integration:** The existing atomic Content + Draft + Version
   #1 + AI Run + Attempt success transaction now clears the source Idea’s
   position. Provider calls remain outside the transaction; provider failure
   and rollback preserve the queue item and priority.
7. **DnD and accessible reorder:** Native pointer drag-and-drop persists the
   full server-authoritative order. Each row has a visible 44px drag handle
   with an accessible name and keyboard ArrowUp/ArrowDown behavior, plus a
   localized screen-reader instruction. No permanent visual Move buttons or
   extra library were introduced. Motion is limited to existing state/spinner
   feedback and is gated with `motion-safe` where applicable.
8. **First-generation flow:** Queue Generate opens the existing Ticket 09
   Generate Script dialog and invokes the existing Ticket 05 → Ticket 06
   path. Successful generation redirects to the real Content editor and the
   source Idea leaves the derived queue while remaining `ACCEPTED`.
9. **Failure/retry:** Failed generation retains `ACCEPTED`, zero Content, and
   the existing position. The queue shows only compact safe failure state and
   delegates Retry to the existing Ticket 07/Ticket 09 retry path.
10. **Content-by-Idea:** `/content?ideaId=...` proves Idea ownership through
    its Generation Batch workspace, returns zero/one/multiple Content and
    durable activity without foreign-ID disclosure, and preserves editor
    links.
11. **Generate Another:** The source-Idea context reuses the same form and
    generation path to create distinct Content aggregates without modifying
    existing Content or Draft records.
12. **Idea Library integration:** Ticket 12 remains compact. Accepted zero-
    Content Ideas show the derived queue state; Accepted Ideas with Content
    link their derived count to the source-Idea Content context. Attempt audit
    history and primary first-generation controls remain out of Idea cards.
13. **EN/FA/RTL/accessibility:** All new copy uses next-intl. The UI was
    checked in English/LTR and Persian/RTL, including mixed Persian/English
    titles and descriptions. Logical layout keeps queue ordering top-to-bottom
    in RTL, preserves `dir="auto"` creator text, keeps focus visible, uses
    44px queue controls, and announces safe failure/conflict states.
14. **Concurrency tests:** Integration coverage verifies deterministic
    backfill, derived membership, exact conflict handling/no partial update,
    concurrent Accept ordering, Save/Reject entry/exit, first-success queue
    clearing, failed-generation preservation, and Content-by-Idea
    nondisclosure. Existing Ticket 06 race/late-result tests remain green.
15. **E2E results and six former skips:** The obsolete Ticket 09 Idea-card
    generation tests are deleted, not restored. The retained queue and Content
    journeys are intentionally small and use deterministic provider wiring;
    lower-level suites prove the server rules and races. No `test.skip` remains
    in the E2E suite.
16. **Full verification:** `db:up`, `db:check`, `db:migrate:test`,
    `format:check`, `lint`, `typecheck`, `build`, `git diff --check`, the
    deterministic unit remainder (36 files / 258 tests), integration tests
    (12 files / 155 tests), and E2E (30 tests) pass. The aggregate `npm run
    test` was also run and has one pre-existing failure: the opt-in AvalAI
    manual smoke harness times out at its five-second test limit; the
    deterministic unit remainder and all integration tests pass when that
    harness is excluded.
17. **Deviations/risks:** No Ticket 11 or Phase 5 work was added. The native
    browser drag API is intentionally kept dependency-free; keyboard and
    touch-safe 44px controls provide the non-pointer equivalent. The existing
    Next.js development server emits intermittent `destination stream closed
    early` warnings during browser teardown, but the final 30-test run passed.

### UI refinement report

1. **Production Queue density:** Replaced tall card-like rows with a cohesive
   separator-based sortable list. Desktop rows are approximately 64–76px,
   while mobile rows stack only the action group that needs extra width.
2. **Priority number:** Replaced “Priority N” wording with muted, tabular,
   zero-padded ordinals (`01`, `02`, …) that remain visually secondary.
3. **Reorder accessibility:** Removed permanent up/down arrow buttons while
   retaining a prominent 44px drag handle with localized instructions and
   keyboard ArrowUp/ArrowDown support. The browser test now asserts the old
   buttons are absent and verifies keyboard persistence.
4. **Content Draft layout:** Replaced the table-like metadata treatment with
   compact, accessible editor links in a responsive two-column desktop grid
   and one-column mobile layout. Existing DTO fields are summarized as
   `Format · Language` and localized `Edited …` text.
5. **EN/FA/RTL and responsive verification:** Inspected 1280x900 English and
   Persian views plus 390x844 English and Persian views with ten queue Ideas,
   long Persian/mixed-direction text, and two drafts. No horizontal overflow
   was observed; queue order stayed top-to-bottom in RTL.
6. **Skills used:** `implement`, `tdd`, `shadcn`, `impeccable`,
   `emil-design-eng`, and `animate`. No `frontend-design` or
   `web-design-guidelines` skill was available in this environment; no
   `pick-ui-library` consultation was needed because no new UI library was
   introduced.
7. **Screenshots/viewports inspected:** Local in-app browser screenshots at
   1280x900 and 390x844 in both locales, including seeded queue/draft states.
8. **Tests changed:** Updated the Content list unit assertions for compact
   cards, updated the legacy Content E2E label assertion, and updated the
   queue E2E flow to assert no permanent arrow controls and exercise the
   accessible keyboard handle. The complete browser suite remains green.
9. **Remaining compromise:** Native drag-and-drop does not provide a moving
   ghost preview as rich as a dedicated sortable library, but it keeps the
   interaction direct and dependency-free while the keyboard equivalent and
   server conflict recovery remain explicit and test-covered.

## Explicit non-goals

Do not add a queue lifecycle enum/status, queue membership table, LexoRank,
fractional indexing, CRDT/collaboration, bulk or automatic whole-queue
generation, background generation, cancellation, due dates, scheduling,
calendar, campaigns, assignees, tags, folders, search, AI prioritization,
recommendations, learning, Content acceptance, AI rewrite, Version History UI,
Phase 5 structured editor, Performance Direction, Edit Direction, publishing,
analytics, or social behavior.

## Dependencies and handoff

Ticket 12 is the only direct blocker. Ticket 13 blocks Ticket 11. Ticket 11
must not begin until both Ticket 12 and Ticket 13 are resolved. Final Product
Architect review remains after Ticket 11 and is not part of this ticket.
