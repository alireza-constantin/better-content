# ADR-017: Derive Production Queue Membership and Persist Order on Ideas

- **Status:** Accepted
- **Date:** 2026-09-04
- **Decision owners:** Product Architect / Technical Lead
- **Applies to:** Phase 4 Production Queue and compact Idea → Content workflow

## Context

The accepted Idea is currently doing too much work in the Ideas surface. An Idea
card can contain decision controls, first-generation controls, all generation
Attempt history, and links to every generated Content record. As Attempts and
Content accumulate, this makes the Idea Library difficult to scan and obscures
the meaning of `ACCEPTED`.

The product needs a compact workflow with three separate concepts:

```text
Ideas
  → decide what is worth making
Content Production Queue
  → decide what to make next
Content Library
  → work with generated Content
```

Idea decision states and `USED` semantics are already established by ADR-005.
The new decision is how planned production work is represented and prioritized
without introducing a second Idea lifecycle or a queue aggregate that merely
duplicates a query over existing relationships.

## Decision

### Membership is derived

An Idea is in the initial Content Production Queue exactly when:

```text
idea.status = ACCEPTED
AND linked Content count = 0
```

Conceptually:

```text
isQueued = idea.status == ACCEPTED && contentCount == 0
```

Queue membership is not persisted. There is no `QUEUED`, `PRODUCED`, `DONE`,
`COMPLETED`, or equivalent Idea status, and no separate `ContentQueue`
aggregate/table solely to represent membership.

The four persisted Idea decision states remain exactly `NEW`, `SAVED`,
`ACCEPTED`, and `REJECTED`. `USED` remains derived from linked Content under
ADR-005.

### Order is persisted on the Idea aggregate

Persist the smallest required ordering metadata on the existing Idea record:

```text
Idea.productionQueuePosition: nullable positive integer
```

The exact relational spelling may follow the existing schema conventions, but it
must remain a narrowly scoped nullable positive integer on Idea rather than a
new queue entity. The value is meaningful only while the Idea is queued.

When a newly accepted Idea has zero linked Content, it enters at the end of the
current queue. If an Idea leaves the queue because it becomes `SAVED` or
`REJECTED`, or because its first Content is successfully created, its position
is cleared or otherwise made irrelevant according to the enforced invariant.
If it is accepted again while it still has zero Content, it enters at the end;
if it already has Content, it does not re-enter the initial queue.

An accepted Idea may continue to produce multiple Content records after leaving
the initial queue. Leaving the queue does not reject, archive, complete, or
freeze the Idea.

### Queue operations use simple transactional integer ordering

The Content surface contains both:

1. a Production Queue of accepted Ideas with zero Content, ordered by the
   persisted position; and
2. a Generated Content Library, optionally filtered by source Idea.

The primary first-generation action is presented in the Production Queue. It
reuses the existing Ticket 09 generation form/action and the established
Ticket 05 → 06 application workflow. It does not create Content directly in
UI code and it does not create a second generation orchestration path.
If generation fails, the queue may show a compact safe failure state and expose
the existing Ticket 07 retry path; failure does not remove the Idea from the
queue.

Creators may reorder a modest queue with drag-and-drop plus an equivalent
keyboard-accessible Move up/Move down interaction. The server loads the
authorized current queue, verifies that the submitted ordered Idea ID set is
exactly the current queue membership, and then transactionally assigns
deterministic positions `1..N`. A membership or set mismatch is a stable
`CONFLICT`; no automatic merge or collaborative ordering is attempted.

The server authorizes the workspace before loading or changing the queue.
Submitted Idea IDs are never ownership proof. Each Idea is authorized through
`Idea → Idea Generation Batch → Workspace`, and foreign IDs are nondisclosing.

### All queue-position mutations share workspace serialization

Every application mutation that can assign, clear, or rewrite a Production
Queue position must participate in one workspace-scoped serialization point.
This includes an Idea becoming newly queue-eligible, queue reorder, an
Accepted queued Idea changing to `SAVED` or `REJECTED`, first successful
Content creation, and any other allowed transition that changes derived queue
membership.

The V1 serialization point is the already-authorized workspace row, locked at
the beginning of the short mutation transaction:

```text
BEGIN
  SELECT workspace
  WHERE id = authorizedWorkspaceId
  FOR UPDATE

  verify authorization and authoritative state
  derive/load the current queue
  assign, clear, or rewrite positions
COMMIT
```

The workspace lock must be acquired before any Idea, Generation Batch, AI Run,
Content, Draft, Version, or quota rows that the same operation needs to lock.
All queue-aware mutation paths use this order: workspace row, then the
operation's domain rows in their existing deterministic order. The lock is
held only for the short database mutation transaction; provider calls remain
outside it.

`productionQueuePosition` never defines membership. In valid application-
created state, a queued Idea has a distinct positive position and a non-queued
Idea has `NULL`. Queue reads derive membership from `ACCEPTED` plus zero linked
Content, then use the position only to order those derived members.

While holding the workspace lock, append operations re-verify workspace
ownership and newly queue-eligible state, load the authoritative queue, and
assign a distinct position after its current last member. Consequently,
concurrent accepts cannot compute and commit the same `MAX(position) + 1`.
The relative order of simultaneous accepts has no product meaning; the
committed result is nevertheless deterministic and valid.

Queue-leave mutations use the same lock. They clear the departing Idea's
position and normalize or otherwise maintain valid positive positions for the
remaining queue according to the V1 strategy. They do not create a completion
state.

The Ticket 06 successful Content/Draft/Version #1/AI Run completion transaction
must acquire this same workspace serialization point before locking its
generation pair and must clear the source Idea's position as part of the same
successful transaction. This extends the existing atomic success invariant; it
does not split or weaken it. Future Ticket 13 implementation must preserve the
same lock order for queue generation, decision changes, and reorder.

## Alternatives considered

### Persist a queue status on Idea

Rejected. A queue status duplicates membership facts, creates additional
lifecycle transitions, and conflicts with the established four-state Idea
decision model and derived `USED` rule.

### Create a separate ContentQueue table/aggregate

Rejected for V1. Queue membership is a direct query over Idea status and linked
Content. A separate aggregate would duplicate state and add synchronization
risks without representing a distinct business fact.

### LexoRank, fractional indexing, or collaborative ordering

Rejected. A modest single-creator V1 queue does not require these algorithms.
Simple integer positions updated transactionally are easier to audit and keep
deterministic.

### Do not persist order

Rejected. A derived order would not survive refresh, logout/login, or future
sessions and would not provide creator-controlled prioritization.

## Consequences

### Positive

- Idea cards remain compact and focused on decision-making.
- Planned work is visible in the Content production workspace.
- Queue membership cannot become stale because it is derived from authoritative
  Idea and Content facts.
- Creator priority survives refresh and sessions.
- Multiple Content records remain valid for one accepted Idea.
- Existing generation, retry, authorization, and lineage boundaries are reused.

### Tradeoffs

- Queue reads require an authorized relational query and derived Content count.
- Reorder updates a modest set of Idea rows in one transaction.
- Position maintenance and migration/backfill need explicit tests and reviewed
  database changes.

## Data integrity and concurrency implications

- Membership must be computed as `ACCEPTED && linked Content count = 0`.
- Successful first Content creation removes the Idea from queue membership by
  changing the derived fact; it must not require a separate completion action.
- Failed generation leaves Content count at zero, keeps the Idea `ACCEPTED`, and
  therefore leaves it queued. The durable failed Attempt remains retryable.
- Reorder must verify the current authorized queue membership inside the
  transaction or through an equivalent serialized, rechecked boundary before
  assigning positions.
- A reorder containing an Idea that has left the queue returns `CONFLICT` and
  cannot write a partial or stale order.
- Positions written by a successful reorder are deterministic positive
  integers with no duplicate active positions.
- Queue order is not collaborative and no automatic merge is required.
- Foreign Idea IDs cannot be inserted into an order.
- Every mutation that assigns, clears, or rewrites a queue position is
  serialized by the authorized workspace row; `productionQueuePosition` is
  never used as the membership predicate.
- Concurrent accepts, accepts racing reorder, decision changes racing reorder,
  and first Content completion racing reorder are resolved at that same
  workspace boundary. A stale ordered-ID set receives `CONFLICT` and no
  partial reorder is committed.
- A valid committed queue has unique positive positions for all derived queue
  members and `NULL` positions for non-members.

## Migration and backfill

The new nullable position column requires a reviewed Drizzle migration under
ADR-012. The existing Idea schema was inspected: `status_changed_at` records
the time of the current decision-state change and does not preserve a
semantically meaningful historical timestamp for when an Idea became
`ACCEPTED`. It therefore must not be used as an acceptance-time backfill.

Seed deterministically from existing provenance, using generation-batch creation
order followed by Idea position and a stable Idea ID tie-breaker, for existing
`ACCEPTED` Ideas with zero linked Content. This is only an initial queue seed;
after migration, creator-controlled positions are authoritative.

The migration must not add a queue status, create a queue table, rewrite
historical Attempts/Content, or change existing Idea decision semantics.

The migration does not backfill or rely on a lock artifact. After deployment,
all position assignment and clearing uses the shared workspace-row
serialization rule above.

## V1 boundaries

This ADR does not add due dates, deadlines, scheduling, assignees, campaigns,
tags, folders, bulk generation, automatic/background generation, cancellation,
automatic prioritization, collaboration, search, recommendations, publishing,
analytics, social behavior, Performance Direction, Edit Direction, or Phase 5
editor behavior. The Production Queue is distinct from the future publishing
queue represented by publication plans.

It also does not define the visual composition beyond the Content surface
containing the queue and generated Content Library, nor does it select a
sortable frontend dependency.

## Relationship to existing ADRs

- ADR-003 remains authoritative for mutable Drafts and immutable Content
  Versions.
- ADR-005 remains authoritative for the four Idea decision states and derived
  `USED`.
- ADR-010 remains authoritative for EN/FA and RTL/LTR behavior.
- ADR-012 remains authoritative for reviewed Drizzle migrations.
- ADR-016 remains authoritative for Content Script provider behavior. This ADR
  changes where the existing generation capability is presented, not how
  generation is orchestrated or which provider is used.
