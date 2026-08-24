# ADR-007: Isolate Social Platforms Behind Capability-Aware Provider Adapters

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Product Architect / Technical Lead

## Context

Better Content V1 needs automatic analytics retrieval from supported external social publications.

Social platforms differ in:

- OAuth flows
- permissions
- account eligibility
- post identifiers
- URL formats
- available analytics
- rate limits
- refresh behavior
- error semantics

The application must not assume a universal social API.

## Decision

All platform-specific logic will be isolated behind provider adapters.

The domain-facing interface should cover concepts such as:

- authorization
- token exchange/refresh
- publication URL parsing
- publication resolution
- analytics retrieval
- provider capabilities

The exact TypeScript interface may be split into smaller interfaces during implementation if that produces cleaner boundaries.

Providers expose capabilities rather than forcing unsupported behavior.

Examples:

- supported metrics
- whether private insights are available
- whether publication resolution is supported
- required connection/account types

## Metric rule

Provider-specific metrics retain provider-specific semantic keys.

Examples:

- `tiktok.view_count`
- `youtube.average_view_duration`
- `instagram.reach`

A future normalized analytics layer may be added, but raw provider semantics must remain available.

## Consequences

### Positive

- Platform differences stay isolated.
- Adding/removing a provider does not rewrite the analytics domain.
- UI can show capabilities accurately.
- Provider API changes are easier to contain.

### Negative

- Adapter implementations require explicit mapping work.
- Some domain workflows must handle unsupported capabilities.

## Constraints

Provider code must not leak across arbitrary UI or domain modules.

Every provider implementation must be re-verified against current official API documentation immediately before implementation.
