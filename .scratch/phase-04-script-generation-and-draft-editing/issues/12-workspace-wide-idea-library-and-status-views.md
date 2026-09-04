# 12 — Add workspace-wide Idea Library and status views

**What to build:** Replace the batch-first primary Ideas interaction with a workspace-wide `/ideas` Idea Library that lets an authorized creator discover, classify, and start Script generation from Ideas across all generation batches, while keeping generation batches available as secondary provenance and history.

**Blocked by:** 09 — Deliver Generate Script UI and synchronous operation feedback; 10 — Deliver the Content list and Script editor with serialized autosave.

**Status:** ready-for-agent

## Goal

Make the workspace-wide Idea Library the primary Ideas experience. A creator
must be able to find New, Saved, Accepted, and Rejected Ideas from every
generation batch without opening a batch first, while preserving the existing
Idea decision rules, Content-generation eligibility, derived Content state,
authorization boundaries, and batch lineage.

## Scope

- Replace the current batch-first primary Ideas view with a workspace-wide
  Library over the existing Idea, Idea Generation Batch, and Content
  relationships.
- Provide directly available `All`, `New`, `Saved`, `Accepted`, and `Rejected`
  views or equivalent status filters. `New` is the default view.
- Use the existing route and URL/query-state conventions. If query state is
  needed, use a stable simple status value rather than introducing a complex
  routing model.
- Return safe Library DTO facts such as Idea identity and text, decision state,
  Idea language, generation timestamp, optional lightweight batch provenance,
  and derived Content existence/count.
- Reuse the existing Idea decision application service/actions for Save,
  Accept, Reject, and other allowed persisted-state changes. Do not duplicate
  transition rules in presentation code.
- Reuse the completed Ticket 09 Generate Script UI and actions for Accepted
  Ideas shown in the Library. Do not duplicate Content-generation logic.
- Keep the existing Generation History surface reachable as a secondary
  provenance/history surface and preserve its batch semantics.
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
- Generate Script remains an explicit creator action available only for
  `ACCEPTED` Ideas. `NEW`, `SAVED`, and `REJECTED` Ideas cannot generate.
- Generating additional Content from an already accepted Idea remains allowed;
  existing Content does not remove Generate Script eligibility.
- Rejected Ideas remain stored and retrievable in `Rejected`; they are not
  deleted, archived, permanently hidden, or used for AI learning.

## Data and persistence constraints

- Prove Library ownership through `Idea → Idea Generation Batch → Workspace`.
  Do not add `workspaceId` to Idea.
- Query existing relational data efficiently. The Library is a read model over
  existing tables, not a new aggregate or persistence model.
- Do not add an Idea Library table, persisted status counts, persisted
  `hasContent`, persisted `USED`, or denormalized batch lineage for UI
  convenience.
- Keep batch provenance/history authoritative for Content DNA version, AI Run,
  requested language, generated order/position, and timestamps. Do not rewrite
  or flatten that lineage into Idea records.
- No database schema or migration change is planned or authorized for this
  correction. Do not introduce a new pagination architecture unless an
  existing documented data-volume requirement already requires it.
- Library DTOs must contain only safe application-shaped facts; do not expose
  provider settings, prompts, raw AI responses, private persistence rows, or
  sensitive operational data.

## Library and Generation History behavior

- `/ideas` opens the workspace-wide `New` view by default, without selecting a
  batch or requiring batch navigation.
- `All` returns every Idea in the current workspace regardless of decision
  state.
- `New` returns every `NEW` Idea in the current workspace across all batches.
- `Saved` returns every `SAVED` Idea in the current workspace across all
  batches and acts as the cross-batch backlog.
- `Accepted` returns every `ACCEPTED` Idea in the current workspace across all
  batches and supports derived Content state plus Generate Script.
- `Rejected` returns every `REJECTED` Idea in the current workspace across all
  batches without making rejected Ideas part of the default active workflow.
- Decision actions remain available from Library items and use the existing
  server-authoritative action/service. After a mutation, the active view and
  any refreshed view reflect the authoritative new state.
- Generation History remains directly reachable as a secondary surface. Its
  existing batch list/detail, lifecycle, DNA-version, requested-language,
  position/order, timestamp, retry, and completed-idea behavior remain intact.
- The correction does not add search, tags, folders, collections, separate
  favorites, Kanban, drag/drop, bulk actions, custom statuses, custom sorting,
  archive/delete, semantic search, embeddings, recommendations, learning, or
  Content lifecycle UI.

## Generate Script integration

- Accepted Library Ideas use the existing Ticket 09 Generate Script form,
  action, synchronous feedback, Attempt history, and redirect to the existing
  localized Content editor.
- The Library passes only the minimal accepted-Idea identity and existing
  application inputs to the established Content-generation boundary.
- The integration does not change Tickets 05–07 acceptance, quota,
  idempotency, lifecycle, retry, or stale-recovery semantics, and does not
  change AvalAI/provider behavior.
- An accepted Idea with existing Content can start another independent Content
  generation and the derived Library count/state reflects the additional
  linked Content after the authoritative data is refreshed.

## Authorization, internationalization, and UX requirements

- Library reads require authentication and current workspace membership.
- Decision mutations and Generate Script use the established V1 owner
  authorization. Client-supplied Idea, batch, or workspace IDs are never
  ownership proof.
- Foreign-workspace Idea IDs and unauthorized Library/batch/resource requests
  remain nondisclosing.
- Use the existing shadcn/ui and Ideas design system. Keep the surface easy to
  scan and status-focused without turning it into a project-management system.
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
  `ACCEPTED`, `REJECTED`, and `ALL` reads span every batch.
- Prove the default `/ideas` load is `New` and does not select a batch first.
- Prove Saved, Accepted, Rejected, and New can be opened directly without
  reopening a generation batch.
- Prove workspace isolation and nondisclosure for foreign-workspace Ideas,
  batches, and client-supplied identifiers.

### Decision transitions and derived Content state

- Cover `New → Saved`, `New → Accepted`, and `New → Rejected`, plus existing
  allowed decision transitions and correct filtering after each mutation.
- Prove accepting an Idea creates no Content or Content-generation operation.
- Prove an Accepted Idea with zero Content, one Content, and multiple Content
  records reports only derived existence/count and never a persisted `USED`
  field or status.
- Prove multiple Content records remain linked to the same Idea.

### Generate Script and history

- Prove an Accepted Idea can start Generate Script from the Library through the
  completed Ticket 09 path.
- Prove an Accepted Idea with existing Content can generate another Content.
- Prove Saved, New, and Rejected Ideas cannot generate.
- Prove Generation History remains reachable and retains batch provenance,
  DNA-version, AI Run, requested-language, order/position, lifecycle, and
  timestamp semantics.

### EN/FA, accessibility, and E2E

- Verify English/LTR, Persian/RTL, mixed-direction Idea text, keyboard
  decision controls, accessible status feedback, and responsive Library/history
  behavior.
- At minimum, the E2E flow generates multiple batches, saves an Idea from an
  older batch, finds it in Saved without reopening that batch, accepts an Idea
  and finds it in Accepted, rejects an Idea and finds it in Rejected, starts
  Generate Script from an Accepted Library Idea, observes derived Content
  count/state updates, and reaches Generation History.

## Acceptance criteria

- [ ] The primary localized `/ideas` surface is a workspace-wide Idea Library,
      not a batch-first detail view, and it can render without a selected batch.
- [ ] The default `/ideas` view is `New` and includes every `NEW` Idea across
      all generation batches in the current workspace.
- [ ] `All`, `New`, `Saved`, `Accepted`, and `Rejected` views or equivalent
      simple status filters are directly available and span all workspace
      batches.
- [ ] `Saved` is the complete cross-batch backlog; no batch must be opened to
      find a Saved Idea.
- [ ] `Accepted` contains every Accepted Idea across batches, exposes derived
      zero/one/multiple Content state, and retains Generate Script.
- [ ] `Rejected` contains every Rejected Idea across batches, while rejected
      records and rejection reasons remain stored and retrievable.
- [ ] `All` returns every workspace Idea regardless of decision state.
- [ ] Save, Accept, Reject, and existing allowed state changes work from the
      Library through the existing decision service/actions, with filters
      updating after mutation.
- [ ] Persisted Idea states remain exactly `NEW`, `SAVED`, `ACCEPTED`, and
      `REJECTED`; no `USED` status, persisted `hasContent`, or persisted count
      is introduced.
- [ ] `hasContent` is derived from linked Content, and one Idea can have
      multiple linked Content records without changing its decision state.
- [ ] Accepting an Idea remains side-effect-free, and only Accepted Ideas can
      Generate Script; Saved, New, and Rejected Ideas cannot.
- [ ] An Accepted Idea with existing Content can generate additional Content
      through the existing Ticket 09 flow without duplicated Content-generation
      logic or changed Tickets 05–07/provider semantics.
- [ ] Generation History remains reachable as a secondary surface and keeps
      its existing batch provenance and history semantics intact.
- [ ] Library reads require current workspace membership, mutations use the
      established owner policy, and foreign-workspace resources are
      nondisclosing.
- [ ] English/LTR, Persian/RTL, Idea-language independence, mixed-direction
      text, accessibility, and responsive behavior are verified.
- [ ] No search, advanced organization, custom status, bulk action,
      archive/delete, custom sorting, new pagination architecture, Content
      lifecycle UI, or Phase 5 behavior is introduced.
- [ ] Automated coverage uses deterministic providers only and includes the
      required workspace-wide, transition, derived-Content, Generate Script,
      history, security, locale, and minimum E2E scenarios.

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

- Blocked by Tickets 09 and 10 so the Library can reuse the completed Generate
  Script and Content/editor integration surfaces.
- Blocks Ticket 11. Ticket 11 must not begin until this ticket is resolved.
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
