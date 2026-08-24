# ADR-011: Use a Provider-Neutral AI Boundary With Validated Structured Output

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Product Architect / Technical Lead

## Context

AI is central to idea generation and content generation, but Better Content should not spread provider-specific APIs across product modules.

The exact initial AI provider and model are intentionally not chosen yet because that decision should be made immediately before the AI implementation phase using current model capabilities, pricing, structured-output support, latency, and reliability.

## Decision

All AI access goes through the internal AI module.

Feature modules request domain operations such as:

- generate ideas
- generate content
- regenerate content

The AI module uses a provider adapter internally.

AI outputs that become domain data must use structured output and runtime schema validation before persistence.

Create an `ai_runs` domain record to preserve operational traceability such as:

- generation kind
- provider
- model
- prompt/template version
- source entity references
- status
- timestamps
- usage metadata
- validated output snapshot
- non-sensitive error information

Do not store or request hidden chain-of-thought/reasoning traces.

## Current provider decision

**Undecided.**

A separate provider/model ADR or amendment must be written before Phase 3 implementation.

Codex must not choose multiple providers or build a complex routing system independently.

## Consequences

### Positive

- Provider changes are contained.
- Feature modules remain domain-focused.
- Structured validation protects persistence.
- AI runs become auditable for future evaluation.

### Negative

- Adds an abstraction layer.
- Lowest-common-denominator abstractions must be avoided.

## Design rule

The provider boundary should expose our application needs, not attempt to mirror every feature of every AI vendor.
