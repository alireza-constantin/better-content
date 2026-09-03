# Phase 3 — AI Foundation and Idea Generation

- **Status:** resolved
- **Prerequisites:** Phase 1 and Phase 2 complete; ADR-014 and ADR-015 accepted
- **Decision owners:** Product Architect / Technical Lead

## 1. Goal and boundaries

Phase 3 lets a workspace owner generate exactly 20 creator-specific ideas from
the current AI-ready Content DNA version, inspect generation history, and
classify every idea. It introduces the narrow provider-neutral AI foundation,
one AvalAI adapter, traceable AI runs/batches/ideas, safe generation controls,
and accessible English/Persian UX.

Required lineage:

```text
Content DNA Version
        ↓
Idea Generation Batch
        ↓
Idea
        ↓
future Content
```

An `ai_run` is the operational trace for the batch's one provider call; it
does not replace the product lineage.

Do not implement or create tickets for: another provider adapter (Gemini,
Claude, Grok, Qwen, DeepSeek, or Kimi); a provider selector, routing, or
fallback; historical DNA generation; a count selector; languages outside
`en`/`fa` or bilingual batches; idea editing, bulk decisions, decision events,
semantic/cross-batch deduplication; prompt UI, embeddings, vector DB,
automatic learning, or generation jobs; or content, publishing, social,
analytics, or asset work.

No code, migration, dependency installation, or ticket is created by this
specification.

## 2. Prerequisites and domain model

Generation is available only when a workspace has a current Content DNA version
that passes Phase 2's canonical server-side AI-readiness function. The Ideas
module must call that function; it must not duplicate readiness rules in a
service or React.

```text
Workspace
  └── Content DNA
        └── immutable Content DNA Version (current, AI_READY)
              └── Idea Generation Batch
                    ├── one AI Run
                    └── exactly 20 Ideas
                          └── future Content (deferred)
```

An **Idea Generation Batch** is the workspace-owned aggregate for one
20-idea operation. It owns source/request facts, idempotency, and user-visible
lifecycle. An **AI Run** is the provider-neutral record for the one provider
call. It owns provider/model/prompt/settings, execution state, safe outcome,
usage, and the successful output snapshot. The one-to-one batch relationship
provides its source traceability; the batch itself owns the DNA version,
language, and requested count. An **Idea** is a first-class immutable generated
proposal; only its decision state, state timestamp, and rejection reason mutate.
It belongs to a batch, not directly to a workspace.

## 3. Persistence model and invariants

Use UUIDs, timezone-aware timestamps, Drizzle schema/migrations, foreign keys,
unique constraints, and check constraints. Use checked strings rather than new
PostgreSQL enums for these evolving values.

### `ai_runs`

`ai_runs` remains provider-neutral/reusable and contains at least:

| Concern | Requirement |
| --- | --- |
| identity/ownership | `id` UUID primary key and non-null `workspace_id` FK. |
| operation | constrained `kind = IDEA_GENERATION`; new runs use `provider = avalai`, `model = gpt-5.6-luna`, `prompt_version = idea-generation/v1`. The migration retains the prior OpenAI/Terra pair for historical runs. |
| actual settings | validated `generation_settings` JSONB, limited to safe audit settings (structured schema name/version, reasoning effort, output cap, timeout, retry policy, service tier). |
| outcome | `status` is PENDING/RUNNING/COMPLETED/FAILED; nullable safe `error_category`. |
| safe result | nullable canonical `output_snapshot` JSONB only on COMPLETED; nullable neutral `usage` JSONB. |
| timestamps | `created_at`, nullable `started_at`, `completed_at`, `failed_at`. |

Do not store raw prompts, raw provider envelope/response ID, refusal text,
hidden reasoning, SDK objects, raw provider usage objects, or an estimated-cost
column. Future reporting may calculate cost from neutral usage and configured
prices.

### `idea_generation_batches`

The batch contains at least:

| Concern | Requirement |
| --- | --- |
| ownership/source | `id`, non-null `workspace_id` FK, non-null `content_dna_version_id` FK. The service verifies that version is current when starting. |
| execution | non-null unique `ai_run_id`; composite FK `(workspace_id, ai_run_id) → ai_runs(workspace_id, id)`: exactly one run per batch and one Phase 3 batch per run. |
| idempotency | non-null opaque UUID `idempotency_key`, unique within workspace; non-null server-computed `request_fingerprint`. |
| request | `requested_language` constrained to `en`/`fa`; `requested_count` constrained to `20`. |
| outcome | batch lifecycle/error category matching paired run, plus the same timestamp set. |

The duplicated workspace ID on batch/run is intentional independent aggregate
ownership. Do not duplicate stable DNA, language, or requested-count facts on
the run. The database must provide a candidate key on `ai_runs(workspace_id,
id)` and use the composite foreign key from
`idea_generation_batches(workspace_id, ai_run_id)` to it (or an equivalent
reviewed PostgreSQL design). This guarantees a paired batch and AI run belong to
the same workspace; the batch's standalone unique `ai_run_id` remains required.

### `ideas`

Each row contains `id`, non-null `batch_id` FK, `position` (1–20), `title`,
`description`, nullable `category`, application-derived `language`, `status`,
`status_changed_at`, nullable `rejection_reason`, and timestamps. There is
**no `workspace_id` on ideas**; ownership resolves via `idea → batch →
workspace`.

Require unique `(batch_id, position)`, a position check from 1 to 20, checked
status/error values, check `requested_count = 20`, unique
`(workspace_id, idempotency_key)`, unique batch `ai_run_id`, history index
`(workspace_id, created_at DESC)`, and ideas-by-batch index. Title uniqueness
is authoritative canonical server validation before atomic insertion, not a
database expression over provider JSON.

## 4. Canonical payload and validation

The successful output snapshot is exactly this canonical shape:

```json
{
  "schemaVersion": 1,
  "ideas": [
    { "title": "string", "description": "string", "category": "string" }
  ]
}
```

`category` is omitted when absent, never empty or `null`. The snapshot preserves
canonical validated model output; idea rows are authoritative for mutable state.
AvalAI Responses strict output represents `category` as required `string | null`; app
normalization changes blank/null to absence before snapshot/row persistence.

Zod remains authoritative even after Structured Outputs. Normalize before
validation and persistence:

| Field | Rule |
| --- | --- |
| title | Required, outer-trimmed, single-line, 1–120 characters. |
| description | Required, outer-trimmed, CRLF/CR normalized to LF, 1–500 characters. |
| category | Optional, outer-trimmed, single-line, 1–80 characters; blank/null absent. |
| ideas | Exactly 20. |

Titles must be unique within a batch after the same canonical normalization and
case-insensitive comparison; preserve display casing. Reject unknown keys. No
semantic/cross-batch deduplication exists. Invalid provider output persists zero
ideas, records durable `error_category = INVALID_OUTPUT`, and returns the
application error `AI_OUTPUT_INVALID`.

## 5. AI service and AvalAI boundary

```text
Ideas UI / server entrypoint
        ↓
Ideas application service
        ↓
AI module: provider-neutral GenerateIdeas contract
        ↓
AvalAI adapter
        ↓
AvalAI Responses API
```

The Ideas module sends domain input and gets only canonical output and safe
neutral usage/failure metadata. It never imports AvalAI or OpenAI SDK/types.
The official Node/TypeScript OpenAI SDK belongs exclusively inside the AvalAI
adapter.

The adapter follows ADR-014 except for the provider, endpoint, and model
selection superseded by ADR-015:

- AvalAI's fixed `https://api.avalai.ir/v1` endpoint through the OpenAI SDK,
  using the Responses API and model `gpt-5.6-luna`;
- strict `text.format` JSON Schema named `idea_generation_v1`, root object,
  `schemaVersion: 1`, `minItems = maxItems = 20`, required `title`,
  `description`, `category: string | null`, and `additionalProperties: false`;
- `reasoning.effort: "medium"`, `service_tier: "default"`,
  `max_output_tokens: 16000`;
- `store: false`; explicit prompt-cache mode with no breakpoint/cache key or
  retention field;
- no tools/files/background/conversation/`previous_response_id`/continuation/
  reasoning summaries/encrypted reasoning; and
- explicit 60-second timeout and `maxRetries: 0`.

Reject a refusal, incomplete/non-completed response, missing text, parse
failure, provider-schema failure, or canonical Zod failure; never return a raw
provider object outside the adapter.

The code prompt identifier is `idea-generation/v1`. Its exact wording belongs
to implementation, but it must separate application instructions from Content
DNA, use supplied DNA faithfully, generate exactly 20 distinct ideas only in
the requested language, avoid generic/repetitive output, respect preferences/
avoidances, and require the selected schema. Do not persist the assembled
prompt; creator text cannot override application instructions.

## 6. Privacy, security, and usage metadata

Where supplied, retain only optional numeric provider-neutral usage values in
`ai_runs.usage`:

- `inputTokens`, `outputTokens`, `totalTokens`;
- `cachedInputTokens`, `cacheWriteTokens`;
- `reasoningTokens`; and
- `computeUnits`.

Absence is valid. Do not persist an AvalAI- or OpenAI-specific usage envelope.

Content DNA is approved server-to-AvalAI generation context. Never send the
AvalAI key, application credentials, secrets, or unrelated account data to the
browser or provider. Create `safety_identifier` server-side as HMAC-SHA-256 of
internal user ID with a dedicated secret: stable for the user, but disclosing no
raw user ID, email, or PII.

Never log raw Content DNA, constructed prompts, provider envelopes/IDs,
refusal text, or hidden reasoning. Safe structured logs may retain request ID,
workspace/user/batch/run IDs, module/operation, lifecycle transition, safe
error category, and neutral usage. `store: false` reduces Responses
application-state storage, not all provider retention; ordinary abuse-monitoring
retention and account-level ZDR/MAM controls remain out of scope. Continue the
Content DNA privacy notice asking creators not to enter unnecessary sensitive
data.

For the manual AvalAI compatibility/cost smoke only, the adapter may expose
the canonical `avalai-request-id` through its adapter-local observability seam.
It is not part of the provider-neutral application result, is not persisted,
and is never exposed to the browser or used to retain a raw provider response.

## 7. Authorization, generation input, and idempotency

Reads require authenticated user, workspace membership, and resource ownership
through the batch. Generation and idea decisions require an authenticated
workspace owner plus resource ownership. Foreign IDs must not reveal whether a
private resource exists. Reuse Phase 1/2 authorization services; do not create
generalized RBAC.

The client submits only:

```text
workspaceId
baseContentDnaVersionId
requestedLanguage: en | fa
idempotencyKey: UUID
```

Count is always 20. The server authorizes, validates shape, and re-reads the
authoritative current DNA. `baseContentDnaVersionId` must equal that version and
it must be AI_READY. Missing/incomplete DNA produces an actionable
`VALIDATION_ERROR`; stale/mismatched DNA yields `CONFLICT`. Neither invokes the
provider.

Requested language must be exactly one element of that immutable DNA version's
`contentLanguages`. The UI defaults it to `defaultContentLanguage`. UI locale
is unrelated. The application, never the provider, assigns idea language.

Canonical idempotency identity contains only immutable inputs:

```text
generationKind = IDEA_GENERATION
baseContentDnaVersionId
requestedLanguage
requestedCount = 20
```

Use stable serialization and a server-computed fingerprint. Do not include UI
locale, transient state, raw prompt, or DNA body. In a short transaction, find
`(workspace_id, idempotency_key)` before quota evaluation. Same fingerprint
returns the original operation/result without provider call or new quota.
Different fingerprint returns `CONFLICT`. Only an absent key can create paired
PENDING records.

A user-facing Retry uses a new UUID, and may create a new operation only after
validation/quota. It is distinct from a replay. Do not build general-purpose
idempotency infrastructure.

## 8. PostgreSQL rate limit and concurrency

Use PostgreSQL only. Per workspace permit at most 3 provider-invoking attempts
in a rolling 10-minute window and 12 in a rolling 24-hour window.

For a new key, a short transaction takes a workspace-scoped transaction
advisory lock (or equivalent row lock guaranteed to exist for the workspace),
releases stale uninvoked reservations, then counts invoked quota events plus
live reservations in each window. If either limit is full, return
`RATE_LIMITED` and commit no batch, run, or reservation. Otherwise insert the
PENDING batch/run pair and live reservation atomically, then commit.

Immediately before calling AvalAI, a second short transaction locks the pair,
conditionally moves both `PENDING → RUNNING`, sets `started_at`, and sets the
reservation's `invoked_at`. Call the provider only when this succeeds; that
consumes quota. If invocation never occurs, release the reservation when
failing/interrupting. Provider-invoking failures retain quota, including
timeout, provider limit/unavailability, invalid output, and unknown failure.
Never hold a database transaction across the request.

The reservation plus serialization is essential: a count-only concurrent query
can exceed either limit. This is a dedicated Phase 3 design, not generalized
rate-limit infrastructure or Redis.

## 9. Lifecycle and stale recovery

Batch and run use exactly:

```text
PENDING → RUNNING → COMPLETED | FAILED
```

Create the PENDING pair together. Every transition locks/re-reads both rows and
uses conditional expected-status updates. No partial successful batch exists.

```text
PENDING records + reservation committed
        ↓ conditional PENDING → RUNNING
AvalAI call outside transaction
        ↓ parse + canonical Zod validation
lock/re-read RUNNING pair
        ↓ one short transaction
snapshot + exactly 20 ideas + both COMPLETED
```

If either record is no longer RUNNING at completion, discard late output and
insert zero ideas. A provider failure conditionally marks only a RUNNING pair
FAILED and cannot overwrite a concurrent terminal outcome.

The stale cutoff is 75 seconds: PENDING uses `created_at`; RUNNING uses
`started_at`. The 15-second safety margin follows the 60-second provider
deadline. No worker or automatic provider re-call is introduced. A generation,
history/detail, retry, or other relevant service entrypoint may
opportunistically recover a stale pair through a conditional locked update to
FAILED with `INTERRUPTED`, terminal timestamps, and release of an uninvoked
reservation. An invoked reservation remains. A late provider response cannot
revive an interrupted or otherwise failed attempt.

## 10. Failure mapping

Persist these safe provider-neutral categories on a failed run and paired batch:

| Category | Applies when | Returned application error |
| --- | --- | --- |
| `TIMEOUT` | Local 60-second deadline expires. | `PROVIDER_ERROR` |
| `RATE_LIMITED` | AvalAI rate-limits an invoked call. Workspace policy returns it with no record. | `RATE_LIMITED` |
| `PROVIDER_UNAVAILABLE` | Transport or provider HTTP 408/409/5xx prevents a result. | `PROVIDER_ERROR` |
| `INVALID_OUTPUT` | Refusal, incomplete/missing/parse/schema/Zod failure. | `AI_OUTPUT_INVALID` |
| `INTERRUPTED` | Stale recovery or loss of active attempt. | `PROVIDER_ERROR` |
| `UNKNOWN` | Other safe unclassified failure. | `PROVIDER_ERROR` |

This is one layered taxonomy, not competing error systems: category is durable
AI operational metadata; application code is stable transport/UI behavior.
Phase 3 extends the existing application error vocabulary with `RATE_LIMITED`,
`PROVIDER_ERROR`, and `AI_OUTPUT_INVALID`. Raw AvalAI errors never reach users;
localized messages are safe and actionable.

## 11. Idea decisions

Persist exactly `NEW`, `SAVED`, `ACCEPTED`, or `REJECTED`. `USED` is never
stored; it is later derived from a content reference under ADR-005. Any Phase 3
state can move directly to any other. Submitting the current canonical state is
a no-op where practical and should not needlessly change `status_changed_at`.

`rejection_reason` is optional free text up to 500 characters, has no taxonomy,
may be blank, and is cleared atomically whenever status leaves REJECTED. Do not
add a decision-event/history table or bulk action.

## 12. UI, accessibility, internationalization, and RTL

The Ideas route is localized and workspace-scoped. Use Server Components for
authorization, initial DTO loading, and non-interactive rendering; keep client
components to generation/decision interaction. React must not call Drizzle or
AvalAI directly.

Provide clear states for no Content DNA, incomplete DNA, ready language
selection and **Generate 20 Ideas**, PENDING/RUNNING, rate limit, current-DNA
conflict, provider failure, and completed result. When DNA is not AI-ready,
guide users back to Content DNA. The client reflects but never owns readiness,
authorization, quota, or lifecycle truth.

Show compact batch history newest-first with date/time, lifecycle result, DNA
version number, requested language, and count. Initial normal view is newest
successful batch. After start/failure, keep that operation visible. Completed
detail shows exactly 20 ideas/current decision state; failed detail shows safe
failure information and Retry; active detail shows in-progress state. Exclude
search, filters, deletion, archive, comparison, analytics, quality score, and
idea editing.

Each idea has keyboard-accessible **Accept**, **Save for later**, and **Reject**
controls plus clear current status. Reject opens a labelled optional
500-character reason interaction. Use appropriate shadcn/ui primitives; use
React Hook Form with Zod for non-trivial client forms. Provide semantic labels,
field-associated errors, visible focus, disabled states, accessible icon labels,
heading hierarchy, status announcements, and usable mobile touch targets. Do
not add fake metrics, decorative dashboard complexity, or placeholder controls.

All visible strings use `next-intl`, work under `/en/...` and `/fa/...`, and
use logical-direction CSS. Verify history, buttons, dialog, focus, and
responsive layout in LTR and RTL. UI locale never translates or mutates DNA,
batches, ideas, or reasons; mixed-language creator text retains normal Unicode
bidirectional behavior.

## 13. Migration requirements

When implementation is approved, create reviewed Drizzle migrations only for:

- `ai_runs`;
- `idea_generation_batches`;
- `ideas`; and
- `workspace_generation_quota_reservations`.

Include the Section 3 foreign keys, checks, uniqueness, and minimal indexes.
Do not modify historical migrations or introduce schema for future providers,
routing, content, jobs, analytics, publishing, social integrations, assets, or
teams. Apply only through the reviewed Drizzle migration workflow.

## 14. Testing strategy

CI must never call live AvalAI. Use a deterministic fake/mocked provider behind
the provider-neutral contract. A real-provider verification, if performed, is a
manual smoke test with non-sensitive test DNA and non-production credentials;
it is outside CI and acceptance gating.

Unit tests must cover canonical request fingerprinting, normalization/limits,
exact 20, duplicate titles, provider mapping, refusal/incomplete/malformed
results, canonical Zod validation, decisions/no-op/rejection-reason clearing,
language validation, and error mapping.

PostgreSQL-backed integration tests must cover:

- relational constraints, exact positions, one-to-one batch/run, and no idea
  workspace ID;
- owner/membership authorization and cross-workspace isolation;
- missing/incomplete DNA and current-version conflict;
- lifecycle success/failure atomicity and conditional late-result rejection;
- stale PENDING and RUNNING recovery, including reservation release/retention;
- concurrent completion/recovery race;
- idempotency replay/no provider call/no quota and mismatched fingerprint;
- workspace quota concurrency, both windows, no-record denial, and invoked
  failure quota consumption; and
- history ordering and safe failed-batch detail.

E2E/UI review must cover ready DNA through mocked generation and decisions;
DNA-not-created/incomplete/active/rate-limited/conflict/failed states; English
and Persian locale switching; LTR/RTL; keyboard/focus/status feedback;
rejection reason; and desktop/mobile responsiveness.

Phase completion also requires formatting, lint, typecheck, unit/integration
tests, build, required Playwright coverage, and `git diff --check`. Frontend
implementation/review must actively use the relevant installed frontend skills
required by `docs/agents/frontend-standards.md`.

## 15. Acceptance criteria

### Domain and persistence

- [ ] Current AI-ready DNA produces one traceable batch, one neutral run, and
      exactly 20 ideas on success.
- [ ] Ideas resolve ownership through the batch and have no `workspace_id`.
- [ ] Generated facts are immutable; decision fields are the only mutable idea
      product data in Phase 3.
- [ ] Batch owns source/request data; run owns execution data; output snapshot
      is only canonical validated output.
- [ ] Database constraints protect lifecycle/count/relationship/idempotency/
      position invariants.

### Generation safety

- [ ] Only current AI-ready DNA and one of its allowed languages generate;
      stale base version returns `CONFLICT` before provider invocation.
- [ ] The adapter uses ADR-014 policy as amended by ADR-015; provider SDK types
      never cross the
      boundary.
- [ ] Structured output and canonical Zod both run; malformed, refused, or
      incomplete output writes zero ideas, records durable
      `error_category = INVALID_OUTPUT`, and returns `AI_OUTPUT_INVALID`.
- [ ] Success is atomic; late output cannot revive terminal attempts; automatic
      provider retries never occur.
- [ ] Stale attempts recover safely after 75 seconds without worker/re-call.

### Cost, privacy, and UX

- [ ] Same-key/same-request replays consume neither provider nor workspace
      quota; mismatched reuse is `CONFLICT`.
- [ ] PostgreSQL safely enforces 3 invoking attempts/10 minutes and 12/24
      hours; denial creates no batch/run; invoked failures count.
- [ ] Reads require membership, mutations require owner role, and foreign
      resources reveal no private existence.
- [ ] Raw prompts/DNA logs/provider envelopes or IDs/refusals/reasoning/API keys
      are not exposed or persisted; `store: false` and HMAC safety ID are used.
- [ ] UI covers all required generation/history/detail/decision states in EN/FA,
      LTR/RTL, keyboard-accessibly and responsively.
- [ ] Deterministic provider-mocked CI covers the strategy in Section 14.

## 16. Explicitly deferred scope

Provider adapters/selectors/routing/fallbacks, historical DNA generation,
count/language expansion, bilingual batches, editing/bulk actions/deduplication,
embeddings/learning, prompt UI, generation jobs, content/editor, publishing,
social integration, and analytics remain deferred. A future provider requires
an ADR/amendment, the same neutral contract/privacy/safety requirements, and
representative English/Persian evaluation; it must not rewrite historic records.

## 17. Suggested implementation ticket boundaries and dependencies

This is a suggested dependency graph only. It creates no tickets and does not
authorize ticket creation.

```text
1. Domain contracts and validation
        ↓
2. Phase 3 schema and reviewed migration
        ↓
3. Provider-neutral AI contract and deterministic fake
        ↓
4. AvalAI adapter/configuration/privacy boundary
        ↓
5. Generation service: DNA, idempotency, lifecycle, quota, stale recovery
        ↓
6. Batch/history and decision services
        ↓
7. Ideas UI, i18n, RTL, accessibility, responsive behavior
        ↓
8. Integration/E2E hardening and manual smoke-test procedure
```

Contracts for 1–4 must be agreed first. Item 5 depends on 1–4; item 6 on the
stable persistence contract; item 7 on 5–6; and item 8 on all prior work. No
ticket may introduce deferred scope.

## 18. Source-of-truth review

The PRD, Architecture, ADR-002/003/005/010/011/012/013/014/015, Phase 2
specification, frontend standards, and supplied resolved Phase 3 planning
decisions were reviewed. They align on provider-neutral AI, structured runtime
validation, immutable DNA lineage, 20-idea batches, derived USED state,
workspace authorization, PostgreSQL, deterministic testing, and EN/FA RTL/LTR.

The Product Architect explicitly resolved the earlier documentation conflicts:

- Architecture §13 now states that ownership resolves `Idea → Idea Generation
  Batch → Workspace`, and Ideas have no `workspace_id`. Its old conceptual
  Idea field list has been aligned accordingly.
- PRD §14 now distinguishes an accepted idea-generation operation, which
  creates a batch, from a pre-generation authorization, validation, Content
  DNA freshness/readiness, or workspace-rate-limit denial, which creates none.
  It also states that an idempotent replay returns the existing batch rather
  than creating another.

No unresolved source-of-truth contradictions remain. Architecture §§22 and
24–25 are aligned: ADR-014 and ADR-015 supply the provider-neutral contract and
current AvalAI/Luna production choice that Architecture anticipated, while
relational source IDs, batch request facts, prompt version, and actual settings
satisfy traceability without storing raw prompts.
