# 12 — Add unified workspace-wide Idea Library filters and compact cards

**What to build:** Replace the batch-first primary Ideas interaction with one
compact workspace-wide `/ideas` Idea Library. It lets an authorized creator
discover and classify Ideas using independent status and generation-run filters,
while retaining generation batches as separate provenance entities inside that
same Library experience. The primary first-generation workflow belongs to the
Content Production Queue in future Ticket 13, not to each Idea card.

**Blocked by:** 09 — Deliver Generate Script UI and synchronous operation feedback; 10 — Deliver the Content list and Script editor with serialized autosave.

**Status:** ready-for-agent

## Goal

Make the workspace-wide Idea Library the one primary Ideas experience. A
creator must be able to find New, Saved, Accepted, and Rejected Ideas from
every generation batch without opening a batch first, and narrow any status by
one owned Past Run without leaving `/ideas`. Preserve the existing Idea
decision rules, Content-generation eligibility, derived Content state,
authorization boundaries, and batch lineage.

## Scope

- Replace the current batch-first primary Ideas view with a compact
  workspace-wide Library over the existing Idea, Idea Generation Batch, and
  Content relationships.
- Provide directly available `All`, `New`, `Saved`, `Accepted`, and `Rejected`
  views or equivalent status filters plus an integrated `All runs` or one
  owned-generation-batch Past Runs filter. The default is `New + All runs`.
- Combine the selected status and Past Run server-side. Do not load every Idea
  into the browser to filter client-side.
- Use simple stable URL/query state consistent with existing route conventions:
  `/ideas`, `/ideas?view=saved`, and
  `/ideas?view=saved&batchId=<owned-batch-id>` are the required model. Do not
  introduce a complex routing hierarchy.
- Return safe Library DTO facts such as Idea identity and text, decision state,
  Idea language, generation timestamp, optional lightweight batch provenance,
  and derived Content existence/count.
- Reuse the existing Idea decision application service/actions for Save,
  Accept, Reject, and other allowed persisted-state changes. Do not duplicate
  transition rules in presentation code.
- Do not place the primary first-generation Generate Script action on every
  Accepted Idea card. Ticket 13 will present the existing Ticket 09 capability
  in the Content Production Queue; Ticket 12 only communicates the compact
  queue/Content state needed for navigation.
- Expose Past Runs within the Library's filter/navigation area. Do not create a
  separate Generation History product surface, disconnected History component,
  or navigation flow that leaves the Library for normal run discovery.
- Add focused unit, integration, component, and deterministic E2E coverage for
  cross-batch reads, status transitions, derived Content state, generation
  integration, history, security, and EN/FA RTL/LTR behavior.

## Existing domain semantics and invariants

- Persisted Idea decision states remain exactly `NEW`, `SAVED`, `ACCEPTED`, and
  `REJECTED`. No new Idea status is introduced.
- `USED` is not persisted. Derive the Library fact as:

  `hasContent = exists Content linked to the Idea`

- One Idea may have multiple Content records. Accepted Ideas with zero, one, or
  multiple linked Content records remain valid and must be distinguishable in
  the Library through derived Content existence/count only.
- Accepting an Idea remains side-effect-free. It does not create Content,
  create a Content Generation Attempt, or invoke AI.
- An `ACCEPTED` Idea with zero linked Content is planned production work and may
  show a compact **In content queue** indicator. The primary first-generation
  Generate Script action is not rendered on the Idea card; Ticket 13 presents
  the existing capability in the Content Production Queue.
- An `ACCEPTED` Idea with linked Content may show a compact derived Content
  count/link. Generating additional Content remains allowed from the
  Idea-filtered Content context; existing Content does not change the Idea
  decision state.
- Rejected Ideas remain stored and retrievable in `Rejected`; they are not
  deleted, archived, permanently hidden, or used for AI learning.

## Data and persistence constraints

- Prove Library ownership through `Idea → Idea Generation Batch → Workspace`.
  Do not add `workspaceId` to Idea.
- Query existing relational data efficiently. The Library is a read model over
  existing tables, not a new aggregate or persistence model.
- Define the authoritative server-side read boundary with
  `statusFilter = ALL | NEW | SAVED | ACCEPTED | REJECTED` and
  `generationBatchFilter = ALL | one owned generation batch ID`. Apply both
  filters in the relational query, derive Content count/state without N+1
  Content-count queries, and return only safe DTOs.
- Do not add an Idea Library table, persisted status counts, persisted
  `hasContent`, persisted `USED`, or denormalized batch lineage for UI
  convenience.
- Keep batch provenance/history authoritative for Content DNA version, AI Run,
  requested language, generated order/position, and timestamps. Do not rewrite
  or flatten that lineage into Idea records.
- Ticket 12 itself introduces no database schema or migration change. The
  future queue-position migration belongs to Ticket 13 under ADR-017. Do not
  introduce a new pagination architecture unless an
  existing documented data-volume requirement already requires it.
- Library DTOs must contain only safe application-shaped facts; do not expose
  provider settings, prompts, raw AI responses, private persistence rows, or
  sensitive operational data.

## Unified status and Past Runs behavior

- `/ideas` opens the workspace-wide `New + All runs` view by default, without
  selecting a batch or requiring batch navigation.
- `All`, `New`, `Saved`, `Accepted`, and `Rejected` are the status dimension.
  With `All runs`, each returns all matching Ideas in the current workspace.
- `All runs` or one owned generation batch is the Past Runs dimension. A
  selected run narrows the status result to that batch only; changing status
  preserves the run, and clearing the run preserves status.
- Past Runs appear in the same Library UI, preferably alongside status filters
  on desktop and through a responsive compact control on mobile. Each uses only
  existing safe facts such as generation date/time, requested language, Idea
  count, and lifecycle state where useful; no editable run names or new
  persisted metadata are allowed.
- Batch provenance remains authoritative: batch identity, bound Content DNA
  version, AI Run, requested language, generated position/order, lifecycle,
  and timestamps are exposed within the selected Library context. Do not
  rewrite storage or flatten provenance into Ideas.
- Decision actions remain available from filtered Library items and use the
  existing server-authoritative action/service. After a mutation, the active
  status/run intersection reflects the authoritative new state. For example,
  accepting `New + Run A` removes the Idea there and makes it discoverable at
  `Accepted + Run A`.
- Unsupported status values normalize safely to `New`. A missing, invalid, or
  foreign-workspace `batchId` is nondisclosing and selects no run.
- The correction does not add search, tags, folders, collections, separate
  favorites, Kanban, drag/drop, bulk actions, custom statuses, custom sorting,
  archive/delete, semantic search, embeddings, recommendations, learning, or
  Content lifecycle UI.

## Content-generation boundary and navigation

- Ticket 12 does not implement or place the primary Generate Script action on
  Idea Library cards. Future Ticket 13 presents the existing Ticket 09
  Generate Script form/action in the Content Production Queue.
- For an accepted Idea with linked Content, the Library may link to the Content
  surface with the narrow source-Idea filter, conceptually
  `/content?ideaId=<idea-id>`, if that navigation is already available from
  Ticket 10. Otherwise Ticket 13 owns the navigation implementation.
- Ticket 12 does not duplicate or alter Tickets 05–09 acceptance, quota,
  idempotency, lifecycle, retry, stale-recovery, or provider behavior.
- Full Attempt history is not rendered inline on each Idea card. It remains
  durable and is exposed by the authorized Content/production context owned by
  the existing generation/read behavior and Ticket 13 composition.

## Authorization, internationalization, and UX requirements

- Library reads require authentication and current workspace membership.
- Decision mutations use the established V1 owner authorization. Client-
  supplied Idea, batch, or workspace IDs are never ownership proof.
- Foreign-workspace Idea IDs and unauthorized Library/batch/resource requests
  remain nondisclosing.
- Use the existing shadcn/ui and Ideas design system. Keep the surface compact,
  easy to scan, and status-focused without turning it into a project-management
  system.
- Desktop is one cohesive Library layout: a left filter/navigation area for
  Status and Past Runs, and a main area for the intersected Idea results.
  Mobile may use a compact control, drawer, or sheet, but must preserve the
  same status/run semantics and must not create a separate History surface.
- All visible strings use `next-intl`. Verify English UI is LTR and Persian UI
  is RTL with logical-direction CSS.
- Idea language remains independent of route locale. Mixed Persian/English
  title, description, category, and rejection text uses normal browser bidi
  behavior without translation, reversal, or mutation.
- Preserve semantic controls, keyboard access, focus behavior, status/error
  announcements, responsive touch targets, and useful empty/loading/error
  states in both locales and directions.

## Required tests

Use deterministic providers and fakes only. No live AvalAI calls are permitted
in automated tests.

### Workspace-wide querying

- Create Ideas in multiple generation batches and prove `NEW`, `SAVED`,
  `ACCEPTED`, `REJECTED`, and `ALL` reads span every batch when `All runs` is
  selected.
- Prove `Saved + All runs`, `Saved + an older run`, `Accepted + All runs`,
  `Accepted + a selected run`, `Rejected + All runs`, `Rejected + a selected
  run`, and `All + a selected run` return their exact intersections.
- Prove the default `/ideas` load is `New + All runs` and does not select a
  batch first. Prove direct URL state restores the selected status/run,
  changing status preserves the run, and clearing the run preserves status.
- Prove workspace isolation and nondisclosure for foreign-workspace Ideas,
  batches, and client-supplied identifiers. A selected run must belong to the
  current workspace and never disclose a foreign batch.

### Decision transitions and derived Content state

- Cover `New → Saved`, `New → Accepted`, and `New → Rejected`, plus existing
  allowed decision transitions and correct filtering after each mutation.
- Prove accepting an Idea creates no Content or Content-generation operation.
- Prove an Accepted Idea with zero Content, one Content, and multiple Content
  records reports only derived existence/count and never a persisted `USED`
  field or status.
- Prove multiple Content records remain linked to the same Idea.

### Compact cards and history boundary

- Prove accepted zero-Content Ideas expose compact planned-production state and
  do not render the primary Generate Script action or full Attempt history.
- Prove accepted Ideas with Content expose only a derived Content count/state;
  any Content link uses the narrow source-Idea filter when available.
- Prove Saved, New, and Rejected cards do not expose a misleading generation
  action, while preserving their decision actions.
- Prove the integrated Past Runs filter retains batch provenance, DNA-version,
  AI Run, requested-language, order/position, lifecycle, and timestamp
  semantics without leaving the Library. Ticket 13 owns queue generation and
  Generate Another behavior.

### EN/FA, accessibility, and E2E

- Verify English/LTR, Persian/RTL, mixed-direction Idea text, keyboard
  decision controls, accessible status feedback, and responsive unified
  status/Past Runs filter behavior.
- At minimum, the E2E flow generates multiple batches, saves an Idea from an
  older batch, finds it in `Saved + All runs` and `Saved + that run`, accepts an
  Idea and finds it in `Accepted + that run`, rejects an Idea and finds it in
  `Rejected + that run`, observes compact queue/Content count-state updates in
  global and run-filtered views, and verifies the same unified filters in EN/FA and at
  mobile/desktop widths.

## Acceptance criteria

- [ ] The primary localized `/ideas` surface is a workspace-wide Idea Library,
      not a batch-first detail view, and it can render without a selected batch.
- [ ] The default `/ideas` state is `New + All runs` and includes every `NEW`
      Idea across all generation batches in the current workspace.
- [ ] `All`, `New`, `Saved`, `Accepted`, and `Rejected` views or equivalent
      simple status filters are directly available, and `All runs` plus owned
      Past Runs filters combine with them server-side on the same `/ideas`
      surface.
- [ ] `Saved` is the complete cross-batch backlog at `All runs`, and `Saved +
      a selected run` finds an older-batch Saved Idea without leaving the
      Library.
- [ ] `Accepted` contains every Accepted Idea at `All runs`, supports an owned
      run intersection, exposes derived zero/one/multiple Content state, and
      shows compact planned-production or Content-count state without owning
      primary first-generation Generate Script.
- [ ] `Rejected` contains every Rejected Idea at `All runs` and within an
      owned run, while rejected records and rejection reasons remain stored and
      retrievable.
- [ ] `All + a selected run` returns every Idea in that owned batch regardless
      of decision state.
- [ ] Changing status preserves the selected run, clearing the run preserves
      status, and direct URL state restores the exact safe filter combination.
- [ ] Save, Accept, Reject, and existing allowed state changes work from the
      Library through the existing decision service/actions, with filters
      updating after mutation.
- [ ] Persisted Idea states remain exactly `NEW`, `SAVED`, `ACCEPTED`, and
      `REJECTED`; no `USED` status, persisted `hasContent`, or persisted count
      is introduced.
- [ ] `hasContent` is derived from linked Content, and one Idea can have
      multiple linked Content records without changing its decision state.
- [ ] Accepting an Idea remains side-effect-free. Only Accepted Ideas are
      eligible for generation, but the primary first-generation action is
      presented by the future Content Production Queue rather than Idea cards.
- [ ] Accepted Ideas with existing Content can be linked to the narrow
      source-Idea Content view; Ticket 13 owns Generate Another there without
      duplicating or changing Tickets 05–07/provider semantics.
- [ ] Past Runs is an integrated Library filter, not a separate Generation
      History product surface. Its selected-run context keeps existing batch
      provenance and history semantics intact.
- [ ] Library reads require current workspace membership, mutations use the
      established owner policy, and foreign-workspace resources are
      nondisclosing.
- [ ] English/LTR, Persian/RTL, Idea-language independence, mixed-direction
      text, accessibility, and responsive status/Past Runs filter behavior are
      verified.
- [ ] No search, advanced organization, custom status, bulk action,
      archive/delete, custom sorting, new pagination architecture, Content
      lifecycle UI, or Phase 5 behavior is introduced.
- [ ] Automated coverage uses deterministic providers only and includes the
      required workspace-wide, transition, compact-card, derived-Content, Past
      Runs, security, locale, responsive, and minimum E2E scenarios.

## Explicit non-goals and scope guard

Do not change:

- Idea generation count or generation batch persistence.
- Content DNA behavior or historical DNA lineage.
- AvalAI/provider policy or provider-neutral contracts.
- Content-generation Attempt acceptance, quota, idempotency, lifecycle, retry,
  stale recovery, or provider invocation semantics from Tickets 05–07.
- Content Script generation, Draft editor/autosave, or Content lifecycle.
- Phase 5 editor model, Production Direction taxonomy, structured blocks, or
  anchoring.
- Search, tags, folders, collections, separate favorites, Kanban, drag/drop,
  bulk actions, custom statuses, custom sorting, archive/delete, semantic
  search, embeddings, vector databases, recommendations, learning, or new
  persistence/denormalized lineage.

## Dependencies and blockers

- Blocked by Ticket 10 for the optional narrow Content-link convention. Ticket
  09 remains a reusable generation capability but is not a Ticket 12 card UI
  dependency.
- Blocks future Ticket 13, which consumes this compact Library, and blocks
  Ticket 11. Ticket 11 must not begin until both Ticket 12 and future Ticket 13
  are resolved.
- This is a corrective Phase 4 prerequisite, not a new phase and not a
  replacement or renumbering of existing Phase 4 tickets.

## Expected verification commands

```text
npm run db:up
npm run db:check
npm run db:migrate:test
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
git diff --check
```
