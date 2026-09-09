# ADR-016: Content Script Generation AI Policy

- **Status:** Accepted
- **Date:** 2026-09-03
- **Decision owners:** Product Architect / Technical Lead
- **Applies to:** Phase 4 Script Generation and Draft Editing only

## Context

Phase 4 introduces one new AI workflow: produce one canonical Script document from an accepted Idea, the current AI-ready Content DNA version, a requested Content language, a selected video format, and optional creator instructions.

ADR-011 requires every AI workflow to use the internal provider-neutral AI boundary, validated structured output, and an auditable AI Run. ADR-014 and ADR-015 define the separate Phase 3 Idea-generation policy. ADR-015 supersedes the applicable Phase 3 direct-provider, endpoint, and model portions of ADR-014 while leaving ADR-014's unaffected Phase 3 operating policy in force. ADR-015 explicitly leaves future workflow model selection open. Content Script generation therefore needs its own reviewed provider and operating policy.

This ADR records the accepted Phase 4 AI policy. It does not create implementation tickets, migrations, code, Phase 5 editor work, or changes to other accepted ADRs.

The post-completion amendment below governs new Content generation after the
approved Phase 5 Ticket 09 cutover. The original policy remains the historical
interpretation of existing `content_script_v1` runs and artifacts.

## Decision

### Workflow boundary

The Content module calls the AI module through a narrow provider-neutral `GenerateContentScriptProvider` contract:

~~~text
Content application service
        ↓
AI module: GenerateContentScriptProvider
        ↓
AvalAI OpenAI-compatible infrastructure adapter
        ↓
AvalAI
        ↓
gpt-5.6-luna
~~~

The application contract accepts domain input and returns only the canonical Script result plus safe provider-neutral operational metadata. AvalAI and OpenAI SDK types remain inside infrastructure.

This boundary describes Better Content’s operation; it is not a lowest-common-denominator mirror of a vendor API.

### Provider and transport

The Phase 4 production configuration is:

| Concern | Decision |
| --- | --- |
| provider | AvalAI |
| endpoint | server-controlled `https://api.avalai.ir/v1` |
| model | `gpt-5.6-luna` |
| transport | `openai` npm package as an infrastructure detail |
| API | Responses-compatible API |
| structured output | strict JSON Schema named `content_script_v1` |

Use `AVALAI_API_KEY` and `AI_SAFETY_IDENTIFIER_SECRET` as server-only secrets. Production must not expose or consume a general-purpose base-URL environment variable and must not allow a browser/user to choose an origin. Local provider endpoint injection exists only at the test transport seam for controlled automated tests; it is not an application setting, production fallback, or alternative production endpoint.

There is no Chat Completions fallback, alternate provider, model fallback, provider registry, routing engine, or provider/model selector.

### Fixed generation settings

Each request is one synchronous, one-shot provider call configured with:

| Setting | Value |
| --- | --- |
| reasoning effort | `medium` |
| service tier | `default` |
| maximum output tokens | `16000` |
| local provider timeout | 90 seconds |
| SDK/adapter automatic retries | 0 |
| provider storage request | `store: false` |
| safety identifier | HMAC-SHA-256 of internal user ID with a dedicated server secret |

Omit temperature, top-p, presence/frequency penalties, seed, and other sampling controls. Do not send tools, files, background mode, conversations, `previous_response_id`, continuation, reasoning summaries, or encrypted reasoning items.

Omit `prompt_cache_options`, prompt-cache keys, and cache breakpoints entirely for Phase 4. Adding any prompt-cache request configuration requires a future ADR amendment; it must not enter through generic runtime configuration.

`store: false` reduces provider-side application-state storage; it is not a promise of zero provider retention. Any provider-account retention controls remain an operational concern outside this ADR.

### Strict provider schema

The provider response is exactly:

~~~json
{
  "schemaVersion": 1,
  "script": {
    "text": "..."
  }
}
~~~

The strict provider JSON Schema requires:

- a root object with only `schemaVersion` and `script`;
- `schemaVersion` required and constrained to integer `1`;
- `script` required as an object with only `text`;
- `text` required as a string; and
- `additionalProperties: false` at every object level.

The provider schema is not the product trust boundary. Canonical server validation with Zod remains authoritative.

### Canonical output validation

Reject refusals, incomplete or non-completed results, missing output text, parse errors, provider-schema failures, unknown keys, and canonical-validation failures.

Canonicalization occurs before domain persistence:

1. Normalize CRLF and CR line endings to LF.
2. Trim outer whitespace from `script.text`.
3. Reject empty or whitespace-only text.
4. Reject text longer than 50,000 characters.
5. Produce the canonical `content_script_v1` document.

Never truncate output.

The exact canonical document is intentionally stored in three places with different ownership:

- AI Run `output_snapshot`: operational/audit evidence;
- Content Version #1: authoritative immutable creator-work artifact; and
- initial Content Draft: mutable working state.

At creation those three documents are equal. Only the Draft may later diverge. Do not retain a raw provider envelope, raw `output_text`, raw bytes, or any other unvalidated output copy.

### Prompt policy and untrusted inputs

The code-owned prompt identifier is `content-script-generation/v1`. Its exact prose belongs to implementation review, while these semantics are fixed:

- application instructions are authoritative;
- Idea text, Content DNA fields, and creator instructions are untrusted data and clearly delimited;
- creator data cannot override requested language, selected format, output schema, provider settings, or application policy;
- only the canonical Script document is requested;
- no title, summary, score, rationale, warning, keyword list, direction, block, or production metadata is generated.

`SHORT_VIDEO` guidance targets approximately 30–90 seconds of spoken delivery, with a strong opening, one primary idea, concise natural development, a clear ending, and a CTA only where contextually useful.

`LONG_VIDEO` guidance targets approximately 5–15 minutes of spoken delivery, with a clear opening, deeper coherent development, useful context/examples, a satisfying conclusion, and a CTA only where contextually useful.

These are prompt expectations, not word-count or duration validation. Requested-language compliance is enforced through prompting and creator review; Phase 4 adds no language-detection heuristic or dependency.

### AI Run metadata

The AI Run owns operational configuration and execution metadata:

- kind `CONTENT_SCRIPT_GENERATION`;
- provider and model;
- prompt-template version;
- output-schema name/version;
- reasoning and service-tier policy;
- timeout, maximum output tokens, and retry policy;
- lifecycle timestamps and safe error category;
- provider-neutral usage;
- safe AvalAI request correlation when supplied; and
- canonical validated output snapshot on success.

Use AvalAI’s canonical `avalai-request-id` for safe provider correlation when it is returned. Do not depend on `x-request-id` as the AvalAI identifier.

Provider-neutral usage may contain only available numeric values already established by Phase 3: `inputTokens`, `outputTokens`, `totalTokens`, `cachedInputTokens`, `cacheWriteTokens`, `reasoningTokens`, and `computeUnits`. Absence is valid. Do not persist a raw provider usage object or estimated-cost column.

The AI Run does not duplicate the Attempt’s canonical business request. The one-to-one relationship supplies that source lineage.

### Privacy and observability

Do not persist or log assembled prompts, Content DNA bodies, provider envelopes, raw provider errors, refusal text, hidden reasoning, secrets, or full authorization headers.

Safe structured logs may contain request ID, workspace/user IDs, Attempt/AI Run/Content IDs, module, operation, lifecycle transition, mapped error category, neutral usage, and safe provider request correlation.

Do not perform AvalAI billing/credit lookup in the critical generation request.

### Timeout, retry, quota, and recovery

The local provider timeout is 90 seconds and automatic retries are disabled. A user Retry is a new Content Generation Attempt and a new AI Run; it is not an SDK retry or idempotent replay.

Content generation uses its own PostgreSQL-backed workspace quota:

- 2 provider-invoking attempts per rolling 10 minutes;
- 8 provider-invoking attempts per rolling 24 hours.

An exact idempotent replay is resolved before mutable-state and quota evaluation. Invoked failures consume quota; released uninvoked reservations do not.

Use safe error categories `TIMEOUT`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `INVALID_OUTPUT`, `INTERRUPTED`, and `UNKNOWN`.

At the application boundary, every RATE_LIMITED result identifies `source = WORKSPACE` for local quota denial or `source = PROVIDER` for an invoked AvalAI rate limit. The durable invoked-provider error category remains `RATE_LIMITED`; a workspace denial creates no Attempt or AI Run.

Stale recovery never invokes the provider again. A late provider result cannot resurrect a terminal operation.

### Verification gate

Normal automated tests use a deterministic fake/provider seam and never call AvalAI. They must prove exact request construction, fixed settings, strict schema, refusal/incomplete/malformed handling, canonical validation, error mapping, safe request-correlation handling, and English/Persian plus short/long prompt construction.

Before Phase 4 closes, an opt-in manual smoke test with synthetic non-sensitive data must verify usable canonical generation for:

~~~text
English + SHORT_VIDEO
Persian + SHORT_VIDEO
English + LONG_VIDEO
Persian + LONG_VIDEO
~~~

The smoke test must verify the real endpoint accepts the Responses-compatible strict schema and safely exposes request correlation when supplied. It does not deliberately force a 16,000-token response or real 90-second timeout and never runs in normal CI.

If AvalAI or `gpt-5.6-luna` cannot satisfy the exact contract, implementation stops and this ADR is revisited. Do not introduce a fallback silently.

### Phase 5 post-completion amendment — structured Production Directions

Ticket 09 extends the existing Content-generation operation; it does not add a
second AI invocation or a separate generation workflow. New accepted operations
continue to use generation kind `CONTENT_SCRIPT_GENERATION`, the same Attempt ↔
AI Run lineage, AvalAI provider, `gpt-5.6-luna`, fixed settings, timeout, quota,
privacy, error, idempotency, and transaction rules in this ADR.

The cutover advances the code-owned prompt to
`content-script-generation/v2` and the strict provider output contract to
`generated_content_v4`, schema version 1. The provider payload describes one
complete structured Content result without persistent IDs or Asset references,
using the existing paragraph-block anchor and only the approved Performance and
Edit Direction taxonomy. Directions are generated
only where contextually useful. No prompt, output schema, or adapter may invent
new direction types, range anchors, media URLs, provider result identities, or
Asset identities.

Provider output remains untrusted. The application strictly validates all
blocks, direction variants, payloads, ordering, Script and document limits, then
materializes fresh unique block and direction UUIDs at the trusted domain
boundary. Provider output does not control persistent identifiers. The resulting
canonical ContentDocumentV4 is stored identically in the completed AI Run output
snapshot, immutable `AI_GENERATED` Version #1, and initial Draft in the existing
all-or-nothing completion transaction.

For every AI-generated `BROLL_CUE`, `description` and `searchQuery` are required
and distinct. `description` is the human-facing production instruction.
`searchQuery` is trimmed, non-empty, single-line concise English search text of
at most 200 Unicode code points, including when `requestedLanguage` is Persian.
The generation contract rejects a B-roll query containing URL syntax or a
provider-specific result identity rather than persisting it. AI never emits `assetId` for
`BROLL_CUE` or `SOUND_CUE`; V4 permits creator attachment later through the
existing Asset application boundary.

The AI may generate `SOUND_CUE` instructions under the existing taxonomy, but
Ticket 09 adds no sound discovery or generated audio. Search queries exist only
on `BROLL_CUE`. Script and creator-facing direction text follow the requested
Content language; the English B-roll query is an explicit search-tool exception
and never translates or mutates Script text.

Old prompt/schema versions remain valid historical AI Run metadata. The reviewed
Ticket 09 migration widens database constraints and validated output unions for
the new prompt and output schema without rewriting any existing run, Draft, or
Version. Normal CI uses the deterministic provider seam. An opt-in smoke test
must prove AvalAI accepts the new strict schema and produces useful English and
Persian Content with bounded valid directions before the cutover is considered
complete.

## Rationale

AvalAI and `gpt-5.6-luna` preserve the practical provider/cost direction selected for Phase 3 while keeping the workflow decision explicit. Medium reasoning balances quality and cost. The higher timeout and output limit reflect materially longer Script output. Strict structured output plus canonical Zod validation protects the domain boundary. Zero automatic retries avoids hidden duplicate cost and ambiguous execution.

## Consequences

### Positive

- Content generation remains provider-neutral above infrastructure.
- Provider behavior is fixed, testable, and auditable.
- Script output has one canonical validated representation.
- Phase 3 and Phase 4 can evolve independently by workflow.
- Cost and abuse exposure are bounded without new infrastructure.

### Tradeoffs

- V1 operationally depends on AvalAI compatibility and availability.
- Synchronous execution may be interrupted; durable Attempt recovery handles this without promising background completion.
- Raw provider material is unavailable for debugging by design.
- Long outputs may approach hosting/runtime constraints and require measurement.

## Relationship to existing ADRs

- ADR-003 remains authoritative for mutable Drafts and immutable Content Versions.
- ADR-004 remains authoritative for versioned JSONB and explicit schema evolution; this ADR does not define Phase 5 directions or anchors.
- ADR-005 remains authoritative for derived `USED` and `PUBLISHED` concepts.
- ADR-009 remains authoritative if a future approved phase moves execution to PostgreSQL jobs; Phase 4 adds no jobs.
- ADR-010 remains authoritative for EN/FA and RTL/LTR.
- ADR-011 remains authoritative for the provider-neutral boundary, AI Runs, and validated structured output.
- ADR-014 remains authoritative for Phase 3 operating behavior not superseded by ADR-015. ADR-015 supersedes ADR-014's applicable Phase 3 direct-provider, endpoint, and model selection. This ADR does not change Phase 3 output, timeout, quota, privacy, or failure policy.

## Rejected or deferred alternatives

- Reusing ADR-015 implicitly for Content generation: rejected because ADR-015 is explicitly Phase-3-specific.
- Chat Completions fallback or automatic failover: rejected.
- Low/high/pro reasoning or user tuning: rejected without quality/cost evidence.
- Automatic provider retries: rejected because they can obscure billable attempts.
- Raw-prompt/provider-response retention: rejected for privacy and ownership clarity.
- Automatic language detection: deferred until evidence justifies it.
- AI regeneration, rewriting, inline editing, scoring, background jobs, and
  cancellation remain out of scope. The Phase 5 post-completion amendment above
  supersedes only the original exclusion of generated blocks/directions for new
  Content-generation operations.
