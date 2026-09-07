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

A dedicated server-side runner outside normal user-facing HTTP request
execution claims and processes a bounded number of jobs. It remains part of
the modular-monolith deployment and shares the application's PostgreSQL-backed
job contracts and provider adapters.

The runner may be activated by a deployment scheduler or supervised as a
long-lived process according to the selected host, but it must not depend on a
creator request remaining open. Any trigger/control surface is authenticated
and inaccessible to ordinary users.

The architecture is intentionally hosting-provider-neutral.

Phase 6 Asset ingestion requires a runner environment with Node, Sharp, pinned
`ffprobe`, child-process execution, sufficient execution time and temporary
disk, PostgreSQL connectivity, private S3-compatible storage access, outbound
HTTPS, and structured logging/alert routing. Selecting the actual production
host remains a deployment decision; a host that cannot satisfy this contract
requires architecture review.

## Idempotency

Jobs must be safe to retry.

Use transactions, unique constraints, and deduplication where appropriate.

For upload Finalize, one unique logical processing workflow per Asset is the
preferred durable idempotency boundary. Its existence distinguishes
unfinalized PENDING uploads from finalized PENDING uploads without adding a new
Asset lifecycle status. Concurrent Finalize calls must converge on that
workflow.

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
