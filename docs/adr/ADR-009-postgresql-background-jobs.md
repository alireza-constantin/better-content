# ADR-009: Use PostgreSQL-Backed Background Jobs for V1

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Product Architect / Technical Lead

## Context

Better Content V1 needs asynchronous/retryable work for:

- social analytics synchronization
- provider token refresh
- retryable provider calls
- potentially long AI operations

Introducing Redis, Kafka, or another queue system solely for V1 would add infrastructure and deployment complexity.

PostgreSQL is already required and can support the V1 job volume.

## Decision

Implement a PostgreSQL-backed job queue.

A `jobs` table stores concepts such as:

- job type
- status
- payload
- scheduled execution time
- attempt count
- maximum attempts
- locking metadata
- failure code
- completion timestamp

Workers/runners claim due jobs transactionally.

PostgreSQL row-locking patterns such as `FOR UPDATE SKIP LOCKED` may be used to safely claim work.

Job payloads should contain entity identifiers, not secrets or large documents.

## Execution

A deployment scheduler periodically invokes a protected internal runner that processes a bounded number of jobs.

The architecture is intentionally hosting-provider-neutral.

## Idempotency

Jobs must be safe to retry.

Use transactions, unique constraints, and deduplication where appropriate.

## Consequences

### Positive

- No additional queue infrastructure.
- Transactional relationship with application data.
- Easier local development and deployment.

### Negative

- PostgreSQL also carries queue workload.
- Not intended as a permanent high-throughput distributed job platform.

## Exit criteria

A different queue technology should only be considered if measured workload, latency, reliability, or deployment constraints show PostgreSQL jobs are insufficient.

That change requires an ADR.
