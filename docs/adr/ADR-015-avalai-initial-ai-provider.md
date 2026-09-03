# ADR-015 — AvalAI as the Initial AI API Provider

- **Status:** Accepted
- **Date:** 2026-09-03
- **Decision owners:** Product Architect / Technical Lead

## Context

Better Content already has a provider-neutral `GenerateIdeasProvider` boundary
and a Phase 3 OpenAI Responses implementation defined by ADR-014.

The original production provider decision assumed direct OpenAI API access.

The project has now selected AvalAI for V1 API access because it provides
OpenAI-compatible API access and better fits the project's practical billing
and cost constraints.

This is a provider transition, not a redesign of the AI architecture.

## Decision

Better Content V1 will use AvalAI as the initial production AI API provider.

The application/domain layer continues to depend only on the existing internal
AI provider contract.

Provider-specific details remain behind the infrastructure adapter.

Approved Phase 3 production path:

```text
Ideas application
    ↓
GenerateIdeasProvider
    ↓
AvalAI OpenAI-compatible adapter
    ↓
AvalAI
    ↓
GPT-5.6 Luna
```

Provider:
AvalAI

Trusted API endpoint:
https://api.avalai.ir/v1

SDK:
openai npm package

API:
Responses API

Idea-generation model:
gpt-5.6-luna

Structured output:
Responses `text.format`
`type=json_schema`
`strict=true`
schema=`idea_generation_v1`

Canonical server validation remains mandatory after provider output.

The provider schema is not the product trust boundary.

## Environment / secrets

Use:

`AVALAI_API_KEY`

Keep:

`AI_SAFETY_IDENTIFIER_SECRET`

Do not expose either to browser/client code.

Do not introduce a generic production `AI_BASE_URL`.

The production AvalAI endpoint is controlled by the server-side adapter and
must not become an arbitrary runtime URL.

Test infrastructure may inject a controlled local endpoint through the
existing test seam, but production must not accept arbitrary API origins.

## Model policy

Phase 3 Idea Generation uses `gpt-5.6-luna`.

The model is an application policy, not a user-selectable setting.

Do not add:

- provider selector
- model selector
- automatic provider routing
- fallback provider
- Sol fallback
- Terra fallback

Changing the production model for an existing workflow requires evaluation and
an intentional product/architecture decision.

Future workflows may select a different model based on measured quality and
cost, but this ADR does not select models for workflows that have not yet been
implemented.

## API fallback policy

Do not implement Chat Completions as an automatic fallback.

Ticket 09 must first verify that `gpt-5.6-luna` supports Better Content's exact:

- Responses request
- strict JSON Schema
- `idea_generation_v1` schema
- refusal handling
- incomplete handling
- usage reporting

If this exact production contract is incompatible, implementation stops and
the architectural decision must be revisited.

## Cost policy

V1 AI workflows should default to the least-expensive model that satisfies
defined quality and reliability requirements.

Cost is an explicit engineering constraint.

For Phase 3, Ticket 09 will measure real AvalAI-billed cost using the provider
request identifier and AvalAI transaction lookup API.

Do not add a production cost dashboard or new cost persistence schema as part
of this ADR.

## Request tracing

Use AvalAI's canonical:

`avalai-request-id`

for provider-side request correlation.

Do not depend on `x-request-id` as the long-term AvalAI identifier.

Raw prompts, provider envelopes, refusal text, credentials, and raw provider
errors must not be persisted or logged.

## ADR-014 relationship

ADR-015 supersedes ADR-014 only where ADR-014 selects the Phase 3 direct
production provider, provider endpoint, and model.

ADR-014 remains authoritative for Phase 3 generation behavior that is not
explicitly changed here, including:

- provider-neutral boundary
- Responses-oriented generation
- strict structured output
- canonical validation
- timeout behavior
- SDK retry policy
- safe error normalization
- privacy
- safety identifier
- neutral usage
- no tools/background/conversation/continuation features

ADR-016 separately governs Phase 4 Content Script generation. It does not
expand this ADR's Phase 3 scope or change Phase 3 behavior.

## Consequences

### Positive

- preserves existing provider-neutral architecture
- allows AvalAI without rewriting domain/application layers
- reduces expected generation cost
- preserves deterministic automated testing
- keeps provider migration localized
- avoids premature multi-provider infrastructure

### Tradeoffs

- Better Content depends operationally on AvalAI for V1
- AvalAI compatibility becomes a production dependency
- OpenAI-compatible does not imply perfect behavioral compatibility
- exact model/API/schema compatibility must be smoke-tested
- provider-specific billing/request tracing remains infrastructure-specific

## Out of scope

- multi-provider routing
- automatic failover
- provider selection UI
- model selection UI
- Gemini/Claude/Grok/Qwen/DeepSeek/Kimi adapters
- cost dashboard
- production billing reconciliation subsystem
- Phase 4 product functionality
