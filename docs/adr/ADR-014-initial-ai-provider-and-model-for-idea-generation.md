# ADR-014: Initial AI Provider and Operating Policy for Idea Generation

- **Status:** Accepted
- **Date:** 2026-09-01
- **Decision owners:** Product Architect / Technical Lead
- **Applies to:** Phase 3 idea generation only

**Supersession note:** ADR-015 supersedes this ADR only for the direct
production provider, endpoint, and model selection. Its provider-neutral
contract, Responses-oriented behavior, strict validation, privacy, timeout,
retry, usage, and error policies remain in force.

## Context

ADR-011 requires a provider-neutral AI boundary, validated structured output,
and a provider/model decision before AI implementation. Phase 3 has one narrow
operation: given one immutable AI-ready Content DNA version, `en` or `fa`, a
fixed count of 20, and a prompt-template version, produce exactly 20 ideas.

The canonical result is provider-neutral, and Zod remains the authoritative
persistence boundary even when the provider enforces a response schema:

```json
{
  "schemaVersion": 1,
  "ideas": [
    { "title": "string", "description": "string", "category": "string?" }
  ]
}
```

This ADR is a decision only. It does not authorize Phase 3 implementation,
tickets, migrations, SDK installation, credentials, routing, fallback, or a
provider-selection UI.

## Decision

### Original OpenAI / GPT-5.6 Terra selection

Phase 3 uses **OpenAI only**, with **`gpt-5.6-terra`**, through the
**Responses API** (`POST /v1/responses`). OpenAI documents Terra as the
GPT-5.6 model that balances intelligence and cost; it supports both Responses
and Structured Outputs. Its published text rates are $2 per million input
tokens and $12 per million output tokens; account limits are tier-dependent.
[GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)

Each request is a synchronous, one-shot response: no tools, background mode,
conversation, `previous_response_id`, or server-side continuation.
[Responses API reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)

### Provider-neutral architecture

The Ideas module calls the AI module through the provider-neutral ADR-011
contract; no OpenAI types cross that boundary. The OpenAI adapter returns only
the canonical idea result and provider-neutral safe operational metadata.

OpenAI is the only Phase 3 adapter. Gemini, Claude, Grok, Qwen, DeepSeek, and
Kimi are future candidates only. Do not create their adapters, model routing,
fallbacks, or a provider-selection UI.

### Structured output

Use Responses Structured Outputs:

```text
text.format = {
  type: "json_schema",
  name: "idea_generation_v1",
  strict: true,
  schema: <IdeaGenerationProviderSchema>
}
```

OpenAI documents this as the Responses structured-output mechanism. Strict
schemas require every object property to be required and every object to set
`additionalProperties: false`; optional values are represented by a union with
`null`. [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

`IdeaGenerationProviderSchema` must have a root object and these constraints:

- required `schemaVersion`, integer constrained to `1`;
- required `ideas`, with `minItems: 20` and `maxItems: 20`;
- item objects with required string `title`, required string `description`, and
  required `category` of type `["string", "null"]`; and
- `additionalProperties: false` on root and item objects.

The adapter rejects a refusal, non-completed/incomplete result, missing output
text, parse error, or Zod failure. It then applies the canonical Zod schema
before persistence: exactly 20 ideas, `schemaVersion === 1`, trimmed non-empty
title/description, blank or null category normalized to absence, and all
phase-defined semantic checks, including duplicate titles. Any failure writes
zero ideas and maps to `INVALID_OUTPUT`.

### Reasoning configuration

Set `reasoning.effort: "medium"` in standard mode. OpenAI calls `medium` the
balanced starting point and identifies `low` as latency-sensitive; higher
effort is for measured quality gains. Medium is the initial fit for strong
idea quality with reasonable latency and cost. The task is not research or a
hard quality-first workload, so do not use `high`, `xhigh`, `max`, or pro mode.
[GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model)

Do not request, retain, or replay reasoning summaries or encrypted reasoning
items. There is no multi-turn continuation.

### Timeout, retry, and stale-attempt policy

- **Provider request timeout: 60 seconds.** This is an explicit synchronous
  deadline for a bounded 20-idea response and avoids an SDK's excessively long
  default. It also permits occasional OpenAI safety processing, which can add
  several seconds.
- **Automatic adapter retries: none.** Configure the future OpenAI client or
  request with zero retries. OpenAI SDKs retry transient transport, timeout,
  conflict, rate-limit, and server failures by default; a hidden retry can be
  an additional billable generation and obscure the one-batch/one-run record.
  [Official OpenAI SDK retry/timeout behavior](https://developers.openai.com/api/reference/ruby)
- **User Retry is distinct.** It creates a new batch and `ai_run` with a new
  idempotency key. Replaying the same key returns the existing operation and
  never invokes the provider again.
- **Stale cutoff: 75 seconds from `started_at`.** The 15-second safety margin
  is added to the 60-second deadline. A still-pending/running attempt past the
  cutoff is terminally failed with `INTERRUPTED`; a pending attempt that never
  invoked OpenAI does not consume quota. Completion and failure updates are
  conditional, so a late response cannot resurrect an interrupted/failed run.

The lifecycle remains:

```text
PENDING → RUNNING → COMPLETED | FAILED
```

`INTERRUPTED` is a terminal error category on `FAILED`, not an additional run
status.

### Workspace generation rate limit

Use PostgreSQL-backed workspace quota reservations; do not add Redis.

- At most **3 provider-invoking attempts per rolling 10 minutes**.
- At most **12 provider-invoking attempts per rolling 24 hours**.

For a new idempotency key, a short transaction first checks and reserves both
workspace windows. A denial returns the stable `RATE_LIMITED` outcome, creates
no batch/run, and invokes no provider. On success, create the PENDING batch/run
and consume the reservation only in the conditional transition to RUNNING just
before the provider call. Release an unused reservation if the provider was
never invoked; retain a consumed one even if the attempt fails, because cost or
provider quota may already have been consumed.

Resolve an idempotency-key replay before quota evaluation. It returns the
original operation/result and consumes no new slot. This is V1 cost/abuse
containment, not a substitute for provider account limits.

The planning baseline of 4,000 input plus 2,000 output tokens is approximately
$0.032 per batch before medium-effort reasoning output. At 12 attempts, that
is about $0.38/workspace/day on the baseline: bounded enough for V1 abuse
protection, but not restrictive for normal use and development. Record actual
usage/cost because medium reasoning can increase it.

### API data and privacy policy

Set `store: false` explicitly. It prevents a Responses object from being
stored for later retrieval, but does not mean zero retention: OpenAI states
that Responses normally retains application state for 30 days when `store` is
omitted or true, and ordinary abuse-monitoring logs may retain customer content
for up to 30 days. API data is not used for training by default. Zero Data
Retention or Modified Abuse Monitoring requires separate approval and is out
of Phase 3 scope. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

To avoid unnecessary provider-side state, each request must:

- set `store: false`;
- set `prompt_cache_options.mode: "explicit"` and provide no
  `prompt_cache_breakpoint`, preventing an implicit cache point;
- omit `prompt_cache_key`, deprecated `prompt_cache_retention`, metadata,
  tools, files, background mode, conversations, and continuation; and
- send a stable, privacy-preserving `safety_identifier`: a keyed hash of the
  Better Content user ID, never raw PII.

OpenAI recommends a hashed stable identifier for end-user safety monitoring.
The Responses reference documents explicit cache mode and its current 30-minute
TTL, and recommends hashing rather than sending an email or username.
[Responses request fields](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)

Better Content retains only provider, model, prompt version, generation
settings, safe failure/operational metadata, provider-neutral usage metadata,
and the canonical Zod-validated output snapshot after a completed run. It does
not retain raw constructed prompts, raw provider envelopes, OpenAI response
IDs, refusal text, or hidden reasoning.

### Usage metadata

Where supplied, retain these provider-neutral optional numeric values:

- `inputTokens`
- `outputTokens`
- `totalTokens`
- `cachedInputTokens`
- `cacheWriteTokens`
- `reasoningTokens`
- `computeUnits`

These are generic usage semantics, not OpenAI-specific columns. Responses
supplies input/output/total usage and may supply cache, reasoning, and compute
detail. A separate application estimate may calculate cost from this data and
current configured prices; do not persist a raw provider usage object.
[Responses usage reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)

### Error mapping

| Category | Applies when |
| --- | --- |
| `TIMEOUT` | The local 60-second provider deadline expires. |
| `RATE_LIMITED` | OpenAI rate-limits, or workspace policy denies a new operation. |
| `PROVIDER_UNAVAILABLE` | Transport failure, HTTP 408/409, or OpenAI 5xx prevents a definitive result. |
| `INVALID_OUTPUT` | Refusal, incomplete/non-completed result, missing text, parse/schema error, or semantic Zod failure. |
| `INTERRUPTED` | The process loses the active attempt or stale recovery terminates it. |
| `UNKNOWN` | Any other safe, unclassified failure. |

Raw OpenAI errors, envelopes, prompts, and refusal text are neither persisted
nor shown to users. Safe server logs retain only mapped category and
non-sensitive correlation metadata.

## Consequences

- Phase 3 will have one narrow OpenAI adapter behind ADR-011's provider-neutral
  AI module.
- Exactly-20 structure is enforced by OpenAI for shape and by Zod for
  authoritative domain validation.
- Synchronous work is bounded by an explicit deadline with no hidden retry
  cost; user Retry remains a new, traceable operation.
- PostgreSQL supplies the workspace abuse/cost boundary without new
  infrastructure.
- `store: false` and minimized optional request state reduce provider-side
  persistence but do not provide Zero Data Retention.

## Rejected or deferred alternatives

- Chat Completions/JSON mode: rejected; strict Responses Structured Outputs is
  the selected current OpenAI mechanism.
- `reasoning.effort: "none"` or `"low"`: rejected as the initial setting;
  they prioritize latency more than the required quality balance.
- `high`, `xhigh`, `max`, and pro mode: rejected as unjustified cost/latency.
- Automatic provider retries: rejected because an ambiguous attempt could have
  been billed and must remain independently auditable.
- Redis/global rate-limit infrastructure: rejected; PostgreSQL is sufficient.
- Fallbacks, routing, placeholder adapters, and provider-selection UI:
  deferred.

## Future-provider extensibility

Any future provider must satisfy the same provider-neutral contract: exactly
20 canonical ideas, authoritative Zod validation, safe metadata, bounded
timeout/retry semantics, idempotency, workspace quota, privacy review, and
deterministic error mapping. A provider/model change requires a new or amended
ADR plus representative English and Persian evaluation; it must not alter
historical `ai_runs`, batches, or ideas.
