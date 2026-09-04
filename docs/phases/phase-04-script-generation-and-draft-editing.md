# Better Content — Phase 04: Script Generation and Draft Editing

## 1. Status

- **Status:** Ready for implementation
- **Decision owners:** Product Architect / Technical Lead
- **Prerequisites:** Phases 1–3 complete
- **Required ADR:** ADR-016 accepted
- **Review result:** approved Product Architect corrections applied; documentation reconciled; acceptance criteria complete

This document is the authoritative Phase 4 implementation specification. It does not itself create implementation tickets, migrations, dependencies, or code.

## 2. Problem Statement

Phase 3 ends with first-class Ideas that creators can classify, but an accepted Idea does not yet become usable creator work. Better Content needs to turn a deliberately selected Idea into an editable Script without losing the exact Idea, current Content DNA version, request inputs, AI execution facts, or original generated artifact.

A plain mutable text record would destroy the distinction between provider output and later human edits. Automatically creating Content on Idea acceptance would conflate selection with generation. Designing Production Directions now would prematurely decide Phase 5’s taxonomy and anchoring model.

## 3. Solution

Phase 4 adds an explicit, durable, Script-only generation workflow:

~~~text
ACCEPTED Idea
  ↓ explicit creator action
Content Generation Attempt
  ↓ exactly one
AI Run
  ↓ canonical validated Script
Content
  ├── mutable, revisioned Draft
  └── immutable AI-generated Content Version #1
~~~

The Attempt preserves immutable business inputs. The AI Run preserves safe operational configuration and canonical validated output. A successful terminal transaction creates Content, Draft, and Version #1 atomically. Human edits affect only the Draft and autosave through optimistic revision control.

Performance Direction, Edit Direction, structured blocks, anchors, acceptance, publishing, and AI editing remain outside Phase 4.

## 4. Source-of-truth dependencies

The authoritative repository documents form a source-of-truth set: `docs/PRD.md`, `docs/ARCHITECTURE.md`, accepted ADRs, approved phase specifications, `AGENTS.md`, and `docs/agents/frontend-standards.md`. They must be read together. Where an accepted ADR explicitly supersedes an earlier decision for a defined scope, that supersession governs the specific conflict without discarding unaffected decisions in the earlier document.

ADR-003, ADR-004, ADR-005, ADR-010, ADR-011, ADR-012, ADR-014, ADR-015, and accepted ADR-016 are especially relevant. Section 34 records the Product Architect-approved reconciliation applied to this source-of-truth set.

The corrected Phase 3 Ideas specification is also a dependency: `/ideas` is
one workspace-wide Idea Library with combined status and Past Runs filters.
Generation batches remain separate provenance/history entities exposed within
that Library. Phase 4 consumes that Ideas surface and does not redefine its
four persisted decision states, derived `USED` rule, or ownership model.

## 5. User Stories

1. As a creator, I want to generate a Script only from an Idea I have accepted, so that generation reflects an intentional production choice.
2. As a creator, I want accepting an Idea to remain separate from generating Content, so that selection does not trigger cost or create unwanted work.
3. As a creator, I want one accepted Idea to support multiple Content items, so that I can explore different languages, formats, or approaches.
4. As a creator, I want to choose English or Persian independently of the Idea language and UI locale, so that the output fits my intended audience.
5. As a creator, I want to choose short-video or long-video generation, so that the Script receives appropriate pacing guidance.
6. As a creator, I want to add concise optional instructions, so that I can guide the initial Script without editing system prompts.
7. As a creator, I want generation to use my current AI-ready Content DNA, so that the output reflects my current creative identity.
8. As a creator, I want a stale generation form rejected before provider cost is incurred, so that outdated DNA is not used accidentally.
9. As a creator, I want an accepted generation operation to remain bound to its exact DNA version, so that later DNA edits cannot change its history.
10. As a creator, I want to see generation continue through durable states, so that a slow provider call is not mistaken for a missing result.
11. As a creator, I want safe failure information and an explicit retry path, so that I can recover without losing historical evidence.
12. As a creator, I want successful generation to open the new Draft, so that I can immediately work on the Script.
13. As a creator, I want to edit plain Script text freely, including clearing it completely, so that the Draft remains a true workspace.
14. As a creator, I want Draft changes saved automatically with visible status, so that I understand whether my work is durable.
15. As a creator, I want failed saves to preserve my local text, so that temporary failures do not erase work.
16. As a creator, I want conflicting edits from another tab detected, so that stale autosaves do not overwrite newer work.
17. As a creator, I want a way to reload or copy unsaved text after conflict, so that recovery remains under my control.
18. As a creator, I want a minimal list of Content Drafts, so that I can reopen work without navigating generation history.
19. As a creator, I want Persian UI and Script editing to behave correctly in RTL, so that the workflow is usable in my language.
20. As a creator, I want mixed Persian/English Script text preserved normally, so that the editor does not corrupt bidirectional content.
21. As a creator, I want the initial AI output retained immutably, so that future comparison with my edits remains possible.
22. As a creator, I want generated Content private to my workspace, so that another workspace cannot discover or mutate it.
23. As an operator, I want provider calls idempotent and quota-bound, so that retries and duplicate requests do not create uncontrolled cost.
24. As an operator, I want stale executions recoverable without provider re-call, so that ambiguous operations terminate consistently.
25. As an evaluator, I want the exact Idea, DNA version, business inputs, model policy, and canonical output traceable, so that future quality analysis is possible.
26. As an engineer, I want a deterministic provider seam, so that CI tests behavior without live AvalAI.
27. As an architect, I want the Phase 4 Script document evolvable without freezing Phase 5’s editor schema, so that Production Directions can be designed deliberately.

## 6. Scope

Phase 4 includes:

- explicit Content Script generation from an ACCEPTED Idea;
- Content Generation Attempt persistence and lifecycle;
- exactly one AI Run per Attempt;
- provider-neutral Content Script generation through AvalAI;
- current-DNA acceptance and immutable post-acceptance binding;
- canonical Script document schema version 1;
- atomic Content, Draft, and Version #1 creation;
- minimal human Script editing;
- debounced serialized autosave and optimistic revision conflicts;
- minimal Content list/editor and source-Idea Attempt history;
- full EN/FA, LTR/RTL, accessibility, and responsive behavior;
- deterministic unit/integration/UI/E2E verification;
- closure hardening verification of the corrected Phase 3 Ideas surface before
  Ticket 11 can close; and
- opt-in live AvalAI smoke verification before phase closure.

## 7. Explicit non-goals

The following are explicitly excluded from Phase 4:

- Performance Direction;
- Edit Direction;
- Production Direction taxonomy;
- direction anchors;
- structured production blocks;
- assets or references;
- manual or blank Content creation;
- duplicate/import/paste-as-new Content actions;
- Content archive or deletion UX;
- Content acceptance or accepted snapshots;
- `contents.status`;
- `acceptedVersionId` or publication lifecycle fields;
- publication plans, publishing, social integrations, or analytics;
- learning from human edits;
- collaboration, sharing, or generalized RBAC;
- version-history, diff, restoration, or manual-checkpoint UI;
- per-keystroke immutable versions;
- AI regenerate, rewrite, shorten/lengthen, targeted editing, paragraph generation, inline AI, review, or scoring;
- generation cancellation or provider-abort semantics;
- background-job infrastructure;
- provider/model selectors, prompt editor, or sampling controls;
- semantic deduplication, embeddings, or vector storage;
- language-detection heuristics/dependencies;
- independently redefining the Phase 3 Idea Library's approved status-and-run
  filter information architecture, adding Idea persistence, or redefining Idea
  decision states; and
- any Phase 5 editor-library, taxonomy, or anchoring decision.

## 8. Domain terminology

**Content Generation Attempt** is the workspace-owned product operation created after a new request passes acceptance. It owns immutable canonical business inputs, idempotency, and product-visible lifecycle. Its optional result is derived by finding Content whose `sourceGenerationAttemptId` references the Attempt.

**AI Run** is the workspace-owned operational trace of exactly one provider invocation path. It owns provider/model/prompt/settings, execution lifecycle, safe failure/usage data, request correlation, and the canonical validated output snapshot.

**Content** is a stable workspace-owned creator-work aggregate with immutable source identity.

**Content Draft** is the one mutable Script document associated with Content. “Draft” is descriptive in Phase 4, not a persisted Content lifecycle enum.

**Content Version #1** is the immutable authoritative creator-work snapshot produced by initial AI generation.

**Script** is what the creator says or communicates. In Phase 4 it is plain Unicode text only.

## 9. Lineage invariants

The successful lineage is:

~~~text
Idea Generation Batch DNA Version ──→ Idea
                                      │
Current Content DNA Version ─────────┼─→ Content Generation Attempt
Attempt business inputs ─────────────┤
AI Run configuration/output ─────────┘
                                      ↓
                            Content Version #1
                                      ↓
                           Content + mutable Draft
~~~

The DNA used for Content generation is the current version accepted for the Content operation, not necessarily the historical version that generated the Idea.

These facts are invariant:

- Content is directly owned by one workspace.
- Content sourceIdeaId is immutable.
- Content contentLanguage and format are immutable.
- Attempt sourceIdeaId and contentDnaVersionId are immutable.
- Every Phase 4 Content has exactly one successful source Attempt through its immutable, non-null `sourceGenerationAttemptId`.
- Every Attempt has exactly one AI Run.
- A successful Attempt resolves to exactly one Content; a failed Attempt resolves to none.
- One Idea may have multiple linked Content aggregates.
- USED is derived from linked Content existence and never persisted on Idea.
- Changing Idea decision state later does not rewrite accepted Attempt lineage or delete Content.
- Changing current DNA later does not change an accepted Attempt’s DNA.

## 10. Generation request contract

The client request contains exactly:

~~~text
workspaceId
sourceIdeaId
baseContentDnaVersionId
requestedLanguage
format
instructions?
idempotencyKey
~~~

Rules:

| Field | Canonical rule |
| --- | --- |
| workspaceId | Valid UUID; current authorized workspace |
| sourceIdeaId | Valid UUID; resolves through its batch to the same workspace |
| baseContentDnaVersionId | Valid UUID; must equal current DNA version for a new request |
| requestedLanguage | Exactly en or fa and present in current DNA contentLanguages |
| format | Exactly SHORT_VIDEO or LONG_VIDEO |
| instructions | Optional; outer-trimmed; blank normalizes to absence; maximum 1,000 characters |
| idempotencyKey | Client-generated opaque UUID; unique per new attempt within workspace |

Content language may differ from source Idea language. UI locale is not a generation input. No client field may select provider, model, prompt version, token settings, temperature, output count, or historical DNA.

## 11. New-request acceptance order

A new request uses this ordering:

~~~text
Authenticate and resolve current workspace access
        ↓
Canonicalize request and compute fingerprint
        ↓
Resolve existing workspace idempotency key
        ├── same fingerprint → return original Attempt
        └── different fingerprint → CONFLICT
        ↓ absent key
In one short acceptance transaction:
  verify current owner mutation authority
  verify Idea → Batch → same Workspace
  verify Idea status = ACCEPTED
  resolve current authoritative Content DNA
  verify current DNA is AI_READY
  verify baseContentDnaVersionId = current version ID
  verify requestedLanguage is supported by that version
  acquire workspace quota serialization
  release eligible stale uninvoked reservations
  verify/reserve both Content-generation quota windows
  create PENDING Attempt and exactly one PENDING AI Run
        ↓ commit
Provider execution
~~~

Authorization failure or a foreign resource is nondisclosing. Invalid/ineligible Idea or incomplete DNA returns a safe localized validation result. Stale DNA returns CONFLICT. Workspace quota denial returns RATE_LIMITED. Pre-acceptance denial creates no Attempt, AI Run, or provider invocation; a failed reservation leaves no live quota effect.

The current DNA pointer is checked inside acceptance and is not rechecked after acceptance.

## 12. Idea eligibility and race semantics

Only ACCEPTED Ideas are eligible for a new request. NEW, SAVED, and REJECTED are not eligible. Accepting an Idea itself creates no Content and invokes no provider.

Eligibility is established when the operation is accepted. If the Idea later moves to NEW, SAVED, or REJECTED while the provider call is running, completion proceeds normally. Existing or future Content is not removed by later Idea decisions.

The Generate Script action remains available on accepted Ideas even when they already have Content, because multiple Content aggregates are allowed.

## 13. Current Content DNA semantics

For a new request:

- resolve the workspace’s current Content DNA and immutable current version;
- reuse the authoritative Phase 2 readiness function rather than copying readiness rules;
- require AI_READY;
- require client base version to equal the current pointer;
- require requested language to be in that immutable payload’s supported languages; and
- bind the accepted Attempt permanently to that immutable version.

The accepted Attempt uses the bound version even if the current pointer advances before provider invocation or completion. Do not perform a second pointer check after acceptance. Do not use the Idea batch’s DNA version automatically.

## 14. Content Generation Attempt persistence

Add a Content-generation-specific workflow entity with at least:

| Concern | Requirement |
| --- | --- |
| identity/ownership | UUID ID and non-null workspace ID |
| immutable source | source Idea ID and accepted Content DNA version ID |
| immutable request | requested language, format, canonical nullable instructions |
| idempotency | non-null UUID key and server-computed request fingerprint |
| execution | non-null unique AI Run ID |
| lifecycle | PENDING, RUNNING, COMPLETED, or FAILED |
| failure | nullable safe error category |
| timestamps | created; nullable started/completed/failed |

Use checked strings rather than new PostgreSQL enums for evolving workflow values, consistent with Phase 3.

The Attempt stores no `resultingContentId`. Its result is derived by reverse lookup through Content's non-null unique `sourceGenerationAttemptId`. The Attempt is the durable product source of truth for lifecycle. Its status/error/timestamps must remain consistent with the paired AI Run. COMPLETED requires exactly one reverse-linked Content; FAILED forbids one. PENDING/RUNNING forbid terminal timestamps and reverse-linked Content. Terminal records never return to active states.

Do not persist raw prompts, a copied DNA body, a duplicate Idea body, or a duplicate Script output on the Attempt.

## 15. AI Run relationship

Extend the existing provider-neutral AI Run model for kind CONTENT_SCRIPT_GENERATION while preserving all historical Phase 3 constraints and rows.

Each Attempt has one and only one AI Run in the same workspace. The Attempt owns request facts. The AI Run owns:

- kind, provider, model, and prompt-template version;
- structured-output schema name/version;
- reasoning effort and service tier;
- timeout, output-token cap, and retry policy;
- PENDING/RUNNING/COMPLETED/FAILED execution state and timestamps;
- safe error category;
- optional provider-neutral usage;
- optional safe avalai-request-id correlation; and
- canonical validated output snapshot only on COMPLETED.

The AI Run does not store an assembled prompt, raw input snapshot, estimated cost, provider envelope, raw provider usage, refusal text, raw error, or hidden reasoning.

On initial success:

~~~text
AI Run output snapshot
==
Content Version #1 document
==
initial Draft document
~~~

The AI Run snapshot is operational/audit evidence. Content Version #1 is the authoritative creator-work artifact and is the only one intended for future Content history.

AI Run provider/model/prompt/settings identity is immutable after creation. Its lifecycle transition may mutate only lifecycle-controlled status, error, timestamps, and write-once terminal outcome fields such as canonical output snapshot, neutral usage, and safe provider correlation. Attempt request/lineage fields never mutate; only its lifecycle/error/timestamp fields may change.

## 16. Script document schema version 1

The canonical Phase 4 document is exactly:

~~~json
{
  "schemaVersion": 1,
  "script": {
    "text": "..."
  }
}
~~~

Rules:

- schemaVersion exists only in JSONB; no duplicate relational schema-version column;
- root and script objects reject unknown keys;
- script.text is a string;
- text is plain Unicode, not trusted markup;
- HTML is rendered as text, never injected;
- there is no Markdown contract, rich-text model, embed, structured heading, block, Production Direction, or anchor.

This minimal schema does not supersede ADR-004’s future three-layer semantic model. Phase 5 must define an explicit Draft transform if it changes the mutable document. Immutable schema-v1 Content Versions remain schema v1 and interpretable forever.

## 17. Generated-output canonicalization

After strict provider parsing, canonicalize and validate in this order:

1. Reject refusal, incomplete/non-completed response, missing output, parse failure, schema failure, or unknown keys.
2. Normalize CRLF and CR to LF in script.text.
3. Trim outer whitespace.
4. Reject empty or whitespace-only text.
5. Reject text longer than 50,000 characters.
6. Construct canonical content_script_v1.

Never truncate provider output. Over-limit output is FAILED / INVALID_OUTPUT and consumes quota if invocation occurred.

Do not retain a raw provider output copy. The canonical AI Run snapshot, Version #1 document, and initial Draft document must be deeply equal when created.

## 18. Human Draft validation

Human autosaves:

- accept the same schema-v1 JSON shape;
- normalize CRLF/CR to LF;
- preserve every other intentional whitespace character;
- allow script.text to be empty;
- reject text longer than 50,000 characters;
- validate server-side authoritatively; and
- never update Version #1 or AI Run output.

Deleting all Draft text is valid and does not delete Content.

## 19. Atomic success and failure persistence

The provider call occurs outside a database transaction.

On validated output, one short conditional transaction must:

1. win the Attempt/AI Run completion race;
2. set the canonical AI Run output snapshot and safe usage/correlation;
3. create one Content with immutable identity and non-null unique sourceGenerationAttemptId;
4. create its one Draft from canonical output;
5. create immutable Content Version #1 with source AI_GENERATED and the AI Run link;
6. make the Content result discoverable from the Attempt through the reverse relationship; and
7. mark the Attempt and AI Run COMPLETED consistently.

If the conditional terminal transition loses to recovery/failure, persist no Content, Draft, Version, or late output.

Any provider or persistence failure before atomic success creates none of Content, Draft, or Version. Safe terminal failure updates remain durable where possible.

## 20. Content, Draft, and Version persistence

Content contains:

~~~text
id
workspaceId
sourceIdeaId
contentLanguage
format
sourceGenerationAttemptId
createdAt
~~~

`sourceGenerationAttemptId` is non-null, unique, immutable, and references the successful source Attempt in the same workspace. Content has no Phase 4 lifecycle status or accepted/publication pointer. Content-list “last edited” and ordering use Draft.updatedAt; Content is not touched on every autosave.

Content Draft contains the Content relationship, schema-v1 JSONB document, integer revision, and timestamps. Exactly one Draft exists per Content. It is mutable only through the authoritative Draft application service.

Content Version contains an ID, Content relationship, sequential version number, JSONB document, source, AI Run relationship where applicable, creator user ID, and timestamp. Phase 4 creates exactly Version #1 with source AI_GENERATED. Content Versions are immutable and not exposed through history UI in this phase.

Important database constraints include:

- one Draft per Content;
- unique version number per Content;
- one generated version per successful source AI Run;
- same-workspace Attempt/AI Run and Content/source-Attempt relationships;
- a candidate key on Attempt `(workspaceId, id)` plus a composite Content `(workspaceId, sourceGenerationAttemptId)` foreign key to it;
- unique Content `sourceGenerationAttemptId`, preserving Attempt 1 → 0..1 Content without a cyclic foreign key;
- workspace-scoped Attempt idempotency;
- checked language, format, lifecycle, source, and error values;
- lifecycle/error/timestamp/output consistency; and
- positive Draft revision.

The application transaction proves source Idea ownership indirectly through Idea → Batch → Workspace because Idea deliberately has no workspace column.

Database-level immutability enforcement must reject updates to Content `workspaceId`, `sourceIdeaId`, `contentLanguage`, `format`, and `sourceGenerationAttemptId`; Attempt workspace/source/DNA/request/idempotency/fingerprint/AI Run fields; and every Content Version field. Phase 4 exposes no Content Version delete operation. Only the allowed Attempt/AI Run lifecycle-controlled fields and Draft document/revision/updatedAt may mutate under their domain transition rules.

## 21. Idempotency

Idempotency is scoped by workspace.

The canonical fingerprint includes:

~~~text
generationKind = CONTENT_SCRIPT_GENERATION
sourceIdeaId
baseContentDnaVersionId
requestedLanguage
format
canonical instructions (or canonical absence)
~~~

It excludes idempotency key, UI locale, provider/model, prompt text/version, DNA body, and mutable Idea/DNA state.

After current authentication/workspace-read authorization, same key plus same fingerprint returns the original Attempt before reevaluating current Idea status, DNA pointer/readiness, language support, or quota. It never invokes the provider or consumes quota.

Same key plus a different fingerprint returns CONFLICT. Concurrent same-key requests must create at most one Attempt and one AI Run.

## 22. Workspace Content-generation quota

Content generation has a separate quota from Idea generation:

- 2 provider-invoking attempts per rolling 10 minutes per workspace;
- 8 provider-invoking attempts per rolling 24 hours per workspace.

Reuse the proven Phase 3 PostgreSQL reservation/concurrency pattern through a Content-generation-specific reservation relation tied to Attempt:

- serialize reservation decisions per workspace;
- exact replay precedes quota;
- a live reservation provisionally consumes both windows;
- only transition to RUNNING immediately before provider invocation;
- record invocation atomically with that transition;
- release an uninvoked reservation on pre-invocation failure/stale recovery;
- retain invoked reservations permanently for the window even when generation fails;
- workspace quota never affects another workspace; and
- denial creates no Attempt/AI Run and makes no provider call.

No Redis, global quota service, database-editable user setting, or quota UI.

## 23. Lifecycle, timeout, and stale recovery

Attempt and AI Run lifecycle values are exactly:

~~~text
PENDING → RUNNING → COMPLETED | FAILED
~~~

No CANCELLED or SUCCEEDED value exists. INTERRUPTED is an error category on FAILED.

The provider timeout is 90 seconds. Stale cutoffs are:

- PENDING: createdAt + 105 seconds;
- RUNNING: startedAt + 105 seconds.

Recovery:

- conditionally transitions stale active records to FAILED / INTERRUPTED;
- never invokes AvalAI;
- releases only uninvoked reservations;
- retains invoked quota;
- rejects/discards late provider output;
- never resurrects terminal records; and
- guarantees exactly one terminal winner against completion.

Navigating away sends no cancellation request and creates no lifecycle transition. Because Phase 4 is synchronous and has no job worker, it does not promise survival across browser, server-process, or hosting interruption; durable stale recovery provides the terminal result.

## 24. Failure taxonomy and UX mapping

Durable safe AI categories are:

| Category | Meaning | Application behavior |
| --- | --- | --- |
| TIMEOUT | local 90-second provider deadline expired | localized provider failure with Retry |
| RATE_LIMITED | provider rejected an invoked request | localized rate-limit result |
| PROVIDER_UNAVAILABLE | transport, compatible 408/409, or 5xx failure | localized provider failure |
| INVALID_OUTPUT | refusal, incomplete/missing/parse/schema/canonical failure | localized invalid-output failure |
| INTERRUPTED | stale recovery/lost active execution | localized interrupted failure |
| UNKNOWN | safe unclassified failure | localized generic provider failure |

Every application-level RATE_LIMITED result includes a source discriminator: `WORKSPACE` for local Content-generation quota denial or `PROVIDER` for an invoked AvalAI rate limit. Durable provider error category remains `RATE_LIMITED`. A WORKSPACE denial creates no Attempt; a PROVIDER failure is recorded on the failed Attempt/AI Run. Localized UI may use the source to present accurate safe guidance without exposing raw provider details.

Raw provider errors, refusal text, envelopes, and secrets never reach the UI.

## 25. Retry semantics

Retry exists only for a FAILED Attempt. It:

- preserves the original Attempt and AI Run unchanged;
- uses a fresh idempotency key for the new operation, without prescribing whether the client or server physically generates the UUID;
- creates a new Attempt and new AI Run only after new-request acceptance;
- reuses the failed request’s source Idea, requested language, format, and canonical instructions;
- resolves and binds the current Content DNA rather than the failed Attempt’s version;
- requires the Idea to be currently ACCEPTED;
- requires current DNA to be AI_READY;
- requires requested language to remain supported; and
- reevaluates current quota.

If eligibility/readiness/language fails, return a safe validation result with no new Attempt, AI Run, reservation, or provider invocation. Retry is not automatic, a provider retry, a replay, regeneration, or rewrite.

## 26. Draft autosave and optimistic concurrency

Autosave is debounced approximately 750–1000 ms after typing stops. The browser serializes saves:

~~~text
save document A at revision N → in flight
user edits to B/C/D → retain latest local D
A succeeds with revision N+1
local text differs from A → save D immediately at N+1
~~~

Only one save request is active. The client does not enqueue every intermediate document.

Each save sends baseRevision. The server conditionally updates only when it equals the authoritative revision, then increments revision. Stale writes return CONFLICT and never overwrite newer work.

On conflict:

- stop the autosave queue;
- retain the full unsaved local text;
- announce the conflict accessibly;
- offer Reload authoritative Draft; and
- offer Copy unsaved text.

There is no automatic merge or collaborative editing.

Visible localized states are Unsaved, Saving, Saved, Save failed, and Conflict. A failed save preserves local text and provides explicit Retry/Save. Phase 4 promises no offline persistence or offline queue.

## 27. Authorization, security, and privacy

Reads require authenticated current workspace membership and resource ownership. Generation and all mutations require the current V1 owner role. Do not create generalized RBAC.

For creation, the server transaction proves sourceIdeaId → Idea Generation Batch → same Workspace as the Attempt and eventual Content. Client-provided workspace/resource IDs are never proof of ownership.

Cross-workspace and foreign-resource identifiers are nondisclosing. Authorization happens before replay results or Attempt instructions are returned.

Attempt instructions follow normal Attempt read authorization. They may appear in Attempt history/detail only, not Content list, editor, Content Version UI, or general AI metadata.

Render Script as text. Do not use trusted/raw HTML.

Provider-bound Idea/DNA/instruction text is untrusted creator data. Delimit it under a server-owned prompt policy. Do not send unrelated account data. Keep provider key and HMAC secret server-only.

Do not log or persist raw prompts, DNA payload copies, raw provider output/envelopes/errors, refusal text, hidden reasoning, credentials, or full authorization headers.

## 28. AI/provider policy and observability

ADR-016 fixes:

~~~text
provider: AvalAI
endpoint: https://api.avalai.ir/v1 (server-controlled)
model: gpt-5.6-luna
API: Responses-compatible
schema: strict content_script_v1
reasoning: medium
service tier: default
max output tokens: 16,000
timeout: 90 seconds
SDK retries: 0
store: false
safety identifier: server-only HMAC
~~~

Production has no general-purpose AI base-URL environment variable. Local endpoint injection is permitted only at the controlled test transport seam. Phase 4 omits prompt_cache_options, prompt-cache keys, and cache breakpoints unless a future ADR amendment changes that policy.

No tools, files, background mode, conversations, previous response, continuation, sampling controls, fallback, or cost lookup in the critical path.

Safe structured logs may contain request ID, workspace/user IDs, Attempt/AI Run/Content IDs, module, operation, lifecycle transition, mapped error category, neutral usage, and safe avalai-request-id correlation.

## 29. UI/UX, EN/FA, and accessibility

### Generate Script

An accepted Idea exposes a keyboard-accessible Generate Script action wherever
it appears in the primary Idea Library, including a view narrowed to a specific
Past Run. It opens a focused form containing only:

- requested language;
- SHORT_VIDEO or LONG_VIDEO;
- optional instructions with a visible 1,000-character limit.

Use React Hook Form with Zod for this non-trivial form; server validation is authoritative.

The initiating browser submits the synchronous generation request and immediately shows local generating/pending feedback while that request is in flight. On synchronous success, navigate to the localized /content/{contentId} editor. On synchronous failure, show safe localized failure and Retry.

If a persisted PENDING or RUNNING Attempt is observed through an authorized page load or history read, render that durable state correctly. Do not add polling, split execution endpoints, jobs, `after()`, `waitUntil()`, or other background execution merely to expose active persisted status to the initiating browser.

Failed Attempts remain visible from source Idea generation history/detail and never appear in Content lists. Attempt detail may display canonical inputs, including instructions, under normal authorization.

### Content list

Provide localized /content sorted by `Draft.updatedAt` descending. Each item may show source Idea title, format, Content language, and `Draft.updatedAt` as last-edited time. Provide clear loading, empty, and error states.

Do not add a dedicated Content title, search, filters, folders, bulk actions, queue, archive/delete, or fake metrics.

### Script editor

Provide localized /content/{contentId} with the source context needed to identify the work, the plain-text Script editor, save status, and conflict/failure recovery controls. It may communicate that original AI output is retained but exposes no history/diff interface.

Prefer Server Components for authorization and initial DTO loading. Keep client components focused on generation interaction and Draft editing/autosave. React never calls Drizzle or AvalAI directly. Use appropriate shadcn/ui primitives and cohesive domain components.

### Internationalization and bidi

All visible strings use next-intl. English UI is LTR; Persian UI is RTL. Use logical-direction CSS.

Content language is immutable and independent from UI locale and Idea language. The editor’s text surface sets base language and direction from Content:

- en → lang=en, dir=ltr;
- fa → lang=fa, dir=rtl.

Mixed Persian/English text relies on Unicode/browser bidi behavior. Never reverse strings or mutate creator content during locale changes.

### Accessibility and responsive behavior

Verify labels, field descriptions/errors, keyboard operation, visible focus, disabled states, icon accessible names, heading hierarchy, status/error announcements, adequate touch targets, and usable desktop/mobile layouts in both directions. Conflict and save states must not rely on color alone.

## 30. Migrations

After this specification becomes Ready, reviewed Drizzle migrations may add only:

- contents;
- content_drafts;
- content_versions;
- content_generation_attempts;
- Content-generation quota reservations;
- required foreign/candidate/unique/check/index constraints; and
- compatible expansion of existing ai_runs fields/checks for CONTENT_SCRIPT_GENERATION and safe provider request correlation.

Do not rewrite historical migrations or invalidate existing Phase 3 AI Run rows.

The migration must implement database-level immutability enforcement for Content identity/lineage columns, Attempt request/lineage columns, and all Content Version rows/fields. Content owns the only result foreign key through non-null unique `sourceGenerationAttemptId`; Attempt has no result-content column. Use a same-workspace composite foreign key backed by an Attempt candidate key and do not create cyclic Content/Attempt foreign keys.

Do not add document-schema-version columns, Content lifecycle/acceptance/publication fields, directions, blocks, assets, jobs, analytics, social schema, additional provider schema, or future-phase indexes.

Index only demonstrated Phase 4 access paths: workspace Content list by Draft update, source Idea to Content/Attempts, Attempt history, workspace idempotency, quota windows, and necessary foreign keys.

## 31. Testing decisions and seams

Tests should assert externally observable domain behavior at the highest stable seam and avoid implementation-detail coupling.

Primary seams:

1. **Content application service:** authoritative generation orchestration, authorization, acceptance, idempotency, retry, completion, list/read, and Draft saves.
2. **GenerateContentScriptProvider contract:** one provider-neutral fake for deterministic application tests and one AvalAI adapter contract/request test.
3. **PostgreSQL repositories/schema:** constraints, transactions, quota, races, and isolation.
4. **UI behavior:** focused component tests and Playwright workflows.

Prefer the existing Phase 3 patterns: provider-neutral fake, generation service/repository integration tests, PostgreSQL persistence tests, AvalAI adapter tests, safe provider telemetry seam, and Ideas E2E. Prefer Phase 2’s stale-save/conflict tests for Draft revision behavior.

### Unit and component tests

Cover:

- request/instruction canonicalization and limits;
- stable fingerprint construction/exclusions;
- exact Script provider schema and canonical schema;
- generated versus human-edit validation;
- line-ending and whitespace behavior;
- empty Draft and 50,000-character boundaries;
- provider refusal/incomplete/malformed/oversized mapping;
- fixed AvalAI request policy and prompt input delimiting;
- EN/FA and SHORT/LONG prompt construction;
- neutral usage and safe request-correlation mapping;
- serialized autosave behavior and visible save/conflict states;
- localized Generate Script form and editor semantics; and
- plain-text rendering of HTML-like creator text.

### PostgreSQL integration tests

Cover:

- all table/check/unique/composite ownership invariants;
- one Draft and unique Version number per Content;
- exactly one same-workspace AI Run per Attempt;
- successful Attempt/resulting-Content one-to-one relationship;
- no artifact on failed/late-losing completion;
- accepted-only eligibility and nondisclosing foreign IDs;
- current-DNA acceptance conflict with zero side effects;
- post-acceptance DNA and Idea state changes;
- atomic AI snapshot/Version #1/Draft equality;
- immutable Content identity, Attempt inputs, and Version #1;
- same-key replay and mismatched-key conflict under concurrency;
- separate Content quota windows/reservations and workspace isolation;
- invoked versus uninvoked quota handling;
- rendering of persisted PENDING/RUNNING records plus stale recovery and completion race;
- retry current-state reevaluation; and
- Draft revision success and stale-write rejection.

### End-to-end tests

Cover at minimum:

- accepted Idea → Generate Script form → mocked successful Attempt → editor;
- NEW/SAVED/REJECTED Ideas cannot generate;
- stale current-DNA conflict with no provider telemetry;
- immediate local generating feedback during the synchronous request;
- correct rendering when a persisted PENDING/RUNNING Attempt is observed;
- safe provider failure and Retry;
- failed Attempt history absent from Content list;
- multiple Content items from one accepted Idea;
- the corrected workspace-wide Idea Library with all five status views, `All
  runs`, owned Past Runs filters, and combined status/run behavior before
  closure hardening;
- Content list ordering and metadata;
- autosave sequence, failure preservation, and conflict recovery;
- empty human Draft;
- cross-workspace nondisclosure;
- English UI/LTR and Persian UI/RTL;
- Content-language direction independent of UI locale;
- mixed-direction creator text; and
- desktop/mobile keyboard, focus, and status feedback.

Normal CI never calls AvalAI.
E2E tests must not require polling, split execution endpoints, jobs, `after()`, `waitUntil()`, or simulated background execution for the initiating request.

## 32. Manual AvalAI smoke

Before Phase 4 closes, run an opt-in smoke harness with synthetic non-sensitive Idea and DNA for:

- EN + SHORT_VIDEO;
- FA + SHORT_VIDEO;
- EN + LONG_VIDEO;
- FA + LONG_VIDEO.

Verify the real AvalAI endpoint accepts the exact Responses-compatible strict schema, gpt-5.6-luna produces usable canonical output, and avalai-request-id is safely captured when provided.

Do not deliberately force a 16,000-token output or a real 90-second timeout. This smoke is not a normal CI gate, but successful execution is a Phase 4 closure gate. Failure blocks closure and triggers ADR-016 review; it does not authorize fallback.

## 33. Acceptance criteria

### Eligibility, lineage, and acceptance

- [ ] A new Attempt can be accepted only when source Idea status is ACCEPTED.
- [ ] NEW, SAVED, and REJECTED Ideas cannot create an Attempt, AI Run, reservation, or provider call.
- [ ] Accepting an Idea alone creates no Attempt or Content.
- [ ] One accepted Idea can create multiple independent Content aggregates.
- [ ] USED is derived from linked Content and is never stored as Idea status.
- [ ] Creation proves Idea → Batch → Workspace equals Attempt/Content workspace.
- [ ] workspaceId, sourceIdeaId, contentLanguage, and format are immutable on Content.
- [ ] Later Idea decision changes neither invalidate accepted Attempts nor remove Content.
- [ ] New requests use only current AI-ready DNA and a currently supported en/fa language.
- [ ] Stale baseContentDnaVersionId returns CONFLICT with no Attempt, AI Run, reservation, or provider invocation.
- [ ] After acceptance, no current-pointer recheck occurs and the immutable accepted DNA version remains authoritative despite later DNA changes.
- [ ] The Idea batch’s historical DNA version is not substituted for current Content-generation DNA.

### Ideas-surface prerequisite for Phase 4 closure

- [ ] Before Ticket 11 cross-cutting hardening can close Phase 4, `/ideas` is
      implemented as the workspace-wide Idea Library defined by Phase 3, with
      `All`, `New`, `Saved`, `Accepted`, and `Rejected` views across all
      generation batches, an integrated `All runs` or owned Past Runs filter,
      and `New + All runs` as the default.
- [ ] Ticket 11 verifies that Saved, Accepted, Rejected, and New Ideas are
      discoverable without opening individual batches; that status and run
      filters preserve one another; and that batch provenance remains inside
      the unified Library rather than a secondary product surface.
- [ ] Ticket 11 verifies derived Content existence/count for Accepted Ideas,
      multiple Content records per Idea, continued decision actions and
      Generate Script behavior, membership authorization/nondisclosure, and
      EN/FA LTR/RTL behavior.
- [ ] The Ideas correction introduces no persisted `USED` status, new Idea
      persistence, persisted Content counts, or out-of-scope search/advanced
      organization behavior.

### Attempt, AI Run, and atomic artifacts

- [ ] Every accepted Attempt has exactly one same-workspace AI Run.
- [ ] Attempt owns canonical business inputs; AI Run owns operational configuration/output.
- [ ] Attempt and AI Run expose only PENDING, RUNNING, COMPLETED, and FAILED.
- [ ] Successful completion atomically creates exactly one Content, one Draft, and Version #1; Content stores non-null unique sourceGenerationAttemptId and Attempt stores no resultingContentId.
- [ ] Attempt result lookup derives zero or one Content through sourceGenerationAttemptId, and the same-workspace composite foreign key has no cyclic relationship.
- [ ] Failure or a lost conditional completion creates none of Content, Draft, or Version.
- [ ] COMPLETED Attempt resolves to exactly one Content; FAILED Attempt resolves to none.
- [ ] Version #1 is immutable, numbered 1, source AI_GENERATED, and linked to its AI Run.
- [ ] Content has no persisted lifecycle status, acceptedVersionId, or publication field.
- [ ] Database enforcement rejects mutation of Content identity/lineage, Attempt request/lineage, and Content Versions; only approved lifecycle-controlled AI fields and Draft document/revision/updatedAt can change.

### Script validation and editing

- [ ] Canonical document is exactly schemaVersion 1 plus script.text and rejects unknown keys.
- [ ] No relational document-schema-version column exists.
- [ ] Generated text normalizes CRLF/CR to LF, trims outer whitespace, requires non-empty text, and rejects over 50,000 characters without truncation.
- [ ] Provider-invoked oversized/invalid output fails as INVALID_OUTPUT, consumes quota, and creates no Content artifacts.
- [ ] AI Run output snapshot, Version #1, and initial Draft are deeply equal canonical documents.
- [ ] No raw provider output, prompt, envelope, refusal, or error body is persisted.
- [ ] Human saves normalize line endings, preserve all other whitespace, allow empty text, and reject over 50,000 characters.
- [ ] Human edits alter only Draft and ordinary autosaves create no Content Version.
- [ ] Script is rendered as plain text; HTML-like text never executes.
- [ ] Schema-v1 immutable versions remain interpretable without silent rewrite.

### Idempotency, quota, lifecycle, and retry

- [ ] Same workspace key plus same fingerprint returns the original Attempt before mutable-state/quota evaluation, without a provider call.
- [ ] Same key plus different fingerprint returns CONFLICT.
- [ ] Concurrent exact duplicates create at most one Attempt and one AI Run.
- [ ] Fingerprint includes only the specified canonical business facts and excludes key, UI locale, provider/model, prompt, and DNA body.
- [ ] Content quota is separate from Ideas and enforces 2/10 minutes and 8/24 hours per workspace under concurrency.
- [ ] Live reservations consume capacity; uninvoked releases do not; invoked success/failure consumes one slot.
- [ ] One workspace’s quota cannot affect another workspace.
- [ ] Local quota denial creates no Attempt/AI Run and invokes no provider.
- [ ] Application RATE_LIMITED results identify source WORKSPACE or PROVIDER, while durable invoked-provider error category remains RATE_LIMITED.
- [ ] Provider call runs outside a long database transaction with 90-second timeout and zero automatic retries.
- [ ] Stale PENDING and RUNNING cut off at their specified 105-second timestamps as FAILED / INTERRUPTED.
- [ ] Recovery never invokes the provider, late output never resurrects terminal state, and completion/recovery has one winner.
- [ ] Navigation causes no cancellation transition and no CANCELLED state exists.
- [ ] Retry is available only for FAILED, preserves original history, and uses a new Attempt, AI Run, and fresh idempotency key without constraining which tier generates the UUID.
- [ ] Retry rechecks current accepted Idea/current AI-ready DNA/current language support/quota and binds current DNA.
- [ ] Retry preflight failure creates no new operational records or provider call.

### Draft concurrency and UX

- [ ] Autosave begins approximately 750–1000 ms after typing stops.
- [ ] Client permits one save in flight and coalesces intermediate edits into the latest pending document.
- [ ] Every save supplies baseRevision and successful save increments authoritative revision.
- [ ] Stale save returns CONFLICT and never overwrites newer work.
- [ ] Conflict stops autosave, preserves local text, and offers Reload and Copy unsaved text.
- [ ] Save failure preserves local text and exposes Retry/Save.
- [ ] Unsaved, Saving, Saved, Save failed, and Conflict are visible and accessibly announced.
- [ ] No automatic merge, collaboration, offline persistence, or offline queue is implemented.
- [ ] Initiating UI shows immediate local generating/pending feedback during the synchronous request, then redirects on success or shows safe failure/Retry.
- [ ] Persisted PENDING/RUNNING Attempts render correctly when observed without adding polling, split execution, jobs, after(), waitUntil(), or background execution.
- [ ] Successful generation redirects to localized Content editor only after resulting Content exists.
- [ ] Minimal Content list sorts and labels last edited by Draft.updatedAt and shows only approved metadata.
- [ ] Failed Attempts appear in authorized source-Idea history and never Content list.
- [ ] No Content title/search/filter/folder/bulk/archive/delete/history/diff/restore UI is present.

### Authorization, provider, i18n, and verification

- [ ] Reads require membership; generation and Draft mutations require current V1 owner authorization.
- [ ] Foreign workspace IDs and nested resources are nondisclosing, including replay and Attempt-instruction reads.
- [ ] Script, Idea, DNA, and instruction data cannot execute markup or override server prompt policy.
- [ ] Provider boundary exposes no AvalAI/OpenAI SDK types to Content application/UI.
- [ ] Provider request fixes AvalAI/gpt-5.6-luna, strict content_script_v1, medium/default, 16,000 tokens, 90 seconds, zero retries, store:false, and HMAC safety ID.
- [ ] Production uses the fixed AvalAI endpoint with no general base-URL environment variable; local endpoint injection exists only at the test transport seam.
- [ ] Phase 4 sends no prompt_cache_options, prompt-cache key, or cache breakpoint.
- [ ] No tools/background/conversations/continuation/sampling controls/fallback/cost lookup are used.
- [ ] Only safe neutral usage and optional avalai-request-id correlation are retained.
- [ ] All UI strings are localized and full workflows pass in EN/LTR and FA/RTL.
- [ ] Editor base direction follows immutable Content language, not UI locale.
- [ ] Mixed EN/FA text retains normal Unicode/browser bidi behavior.
- [ ] Generate form, Attempt states, list, editor, save/failure/conflict controls are keyboard accessible and responsive.
- [ ] Deterministic automated tests cover the provider contract without live AvalAI.
- [ ] Opt-in live smoke passes all four language/format combinations before phase closure.
- [ ] Formatting, lint, typecheck, unit/integration tests, build, required Playwright tests, and git diff --check pass.

### Explicit scope boundary

- [ ] No Performance/Edit Direction, taxonomy, anchor, production block, asset/reference, Phase 5 editor library, or structured production schema is introduced.
- [ ] No manual/import/duplicate Content creation, archive/delete, acceptance, publishing, integration, analytics, learning, collaboration, or sharing behavior is introduced.
- [ ] No AI rewrite/regenerate/inline/targeted/review/score behavior is introduced.
- [ ] No generation cancellation, provider abort, background jobs, provider/model selector, prompt editor, semantic deduplication, embedding, vector database, or language detector is introduced.

## 34. Documentation and ADR reconciliation

The Product Architect approved the following surgical corrections. They have been applied to the repository source-of-truth set without changing unrelated accepted decisions.

### Contradictions reconciled

| Source | Exact location | Conflict | Applied correction |
| --- | --- | --- | --- |
| PRD | Section 17, “Content generation should normally begin from an idea” | Phase 4 requires explicit generation from ACCEPTED only and permits multiple Content records. | Replaced the ambiguous rule with accepted-only eligibility, explicit action, multiple-Content allowance, and derived USED behavior. |
| PRD | Section 18, “Generated content initially receives DRAFT status” | Approved Phase 4 has a mutable Draft but no persisted Content status enum. | Reframed generated Content as mutable Draft working state and made DRAFT descriptive until lifecycle implementation. |
| Architecture | Sections 24–25, AI Run conceptual input_snapshot and estimated_cost | Approved separation puts canonical business inputs on Attempt, forbids raw prompt/DNA snapshots, and adds no estimated-cost column. | Replaced those fields with safe operational configuration/output/usage and assigned canonical request facts to the linked workflow entity. |
| Architecture | Sections 32–33, document_schema_version | Approved Phase 4 stores schemaVersion only inside JSONB. | Removed the duplicate relational field from both conceptual models. |
| Architecture | Section 108, Phase 4 “generation from accepted/saved idea” | SAVED Ideas are ineligible. | Changed eligibility to explicit generation from ACCEPTED Ideas only. |
| Architecture | Section 108, Phase 4 conditional Production Directions | Phase 4 excludes all Production Direction generation/design. | Recorded that Script-only Phase 4 adds no directions, blocks, anchors, or taxonomy. |
| Architecture | Section 108, Phase 5 “optimistic concurrency” | Approved Draft concurrency and autosave conflict behavior belong to Phase 4. | Moved initial optimistic Draft revision behavior to Phase 4 and made Phase 5 build on it. |
| Architecture | Section 108, Phase 5 “Script layer” | Phase 4 already establishes the minimal Script document/editor. | Clarified that Phase 5 evolves Script into a structured block/anchor-aware layer. |
| Phase 3 | Section 12, batch history as the primary Ideas surface | The approved V1 workflow requires workspace-wide Idea discovery, status views, and run-based discovery without a disconnected history surface. | Replaced batch-first primary navigation with one Idea Library: status and integrated Past Runs filters, `New + All runs` default, and unchanged batch provenance. |

### Additions applied for consistency

| Source | Exact location | Applied addition |
| --- | --- | --- |
| PRD | Section 18 | Recorded the exact Phase 4 inputs, SHORT_VIDEO/LONG_VIDEO, en/fa current-DNA language rule, 1,000-character instructions, and current-DNA acceptance/binding semantics. |
| PRD | Sections 20 and 24–25 | Recorded the minimal Script schema/editing boundary, immutable AI-generated Version #1, mutable Draft, and later Production Direction editing. |
| PRD | Section 47 | Clarified the business-operation/AI-Run split and canonical output retention rather than raw prompts/provider responses. |
| PRD | Section 62, Decisions 2/6/8 | Recorded accepted-only explicit generation, multiple Content per Idea with derived USED, current-DNA generation lineage, and immutable initial AI version. |
| PRD | Section 63.E | Marked Idea and Content Script provider policies as resolved by their ADRs while keeping future workflow/provider changes decision-gated. |
| Architecture | Sections 20–25 | Added Content Script generation to the provider-neutral flow, referenced ADR-016, and documented safe AI Run ownership. |
| Architecture | Between Sections 29 and 30 | Added Content Generation Attempt, Content-owned sourceGenerationAttemptId, same-workspace acyclic FK design, accepted-current-DNA semantics, one AI Run, idempotency, quota, lifecycle, retry, and atomic result creation. |
| Architecture | Sections 30–36 | Added database-enforced immutable Content/Attempt/Version fields, exact Phase 4 Script schema, generated/human validation distinction, and immutable Version #1 behavior. |
| Architecture | Sections 71 and 82 | Added the synchronous initiating-UI boundary, correct observed PENDING/RUNNING rendering without background machinery, 90/105-second recovery, serialized autosave, Draft.updatedAt ordering, and revision conflicts. |
| Architecture | Sections 103–104 | Distinguished Idea-generation DNA from Content-generation DNA and included Attempt → AI Run → Version #1 lineage. |
| Architecture | Section 106 | Added accepted ADR-016. |
| Architecture | Section 108 | Replaced Phase 4/5 bullets with the approved boundary described above. |
| Architecture / ADR-016 | RATE_LIMITED contract | Added application source WORKSPACE versus PROVIDER while retaining durable provider category RATE_LIMITED. |
| Phase 3 / Phase 4 closure | Idea Library correction | Phase 4 hardening must verify the actual V1 Ideas surface before closure. | Added an explicit Ticket 11 prerequisite without changing Idea persistence, statuses, lineage, or Phase 5 scope. |

### ADR review

| ADR | Review result |
| --- | --- |
| ADR-016 | Accepted with the Product Architect review corrections. |
| ADR-011 | Added a non-substantive note that provider/model decisions are workflow-specific in ADR-014/015 and ADR-016; its provider-neutral decision is unchanged. |
| ADR-015 | Clarified the applicable ADR-014 provider/endpoint/model supersession and cross-referenced ADR-016; its Phase 3 decision is unchanged. |
| ADR-004 | No contradiction and no decision change. Its block example is expressly conceptual; Phase 4’s Script-only schema does not settle Phase 5 structure. A cross-reference may clarify sequencing but is not required. |
| ADR-003, ADR-005, ADR-010, ADR-012, ADR-014 | No Phase 4 decision change required. |

The Idea Library correction is an information-architecture/product UX change
over existing Idea, batch, and Content relationships. It does not change
ADR-005's derived `USED` decision, workspace ownership, lineage, or any other
accepted architectural decision; no new ADR is required.

## 35. Readiness and unresolved issues

Requirements grilling Q1–Q49 and the approved Idea Library correction leave no
unresolved product decision. The default Idea Library state is resolved as
`New + All runs`.

The Product Architect review corrections are applied, PRD and Architecture are reconciled, ADR-016 is accepted, and the acceptance criteria are complete. No unresolved product or architecture contradiction remains for Phase 4.

Phase 4 core implementation is **Ready for implementation**. Ticket 11
cross-cutting hardening and Phase 4 closure remain paused until the corrected
workspace-wide Idea Library is implemented and its actual EN/FA, LTR/RTL,
authorization, status-and-run filter, derived-Content, and integrated batch
provenance behavior is verified. This documentation correction does not create
tickets or authorize opportunistic Phase 5 work. Implementation must still
follow the repository's ticket-decomposition and approval workflow.
