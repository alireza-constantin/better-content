# ADR-006: Separate Publication Plans From External Publications

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Product Architect / Technical Lead

## Context

In V1, Better Content does not automatically publish to social platforms.

The creator accepts a content version, intends to publish it to one or more platforms, publishes externally, and then registers the resulting external post.

A single content-level publishing status cannot represent multiple target platforms independently.

## Decision

Use two separate domain entities.

### Publication Plan

Represents intent:

> This accepted content version should be published to this platform.

A plan references:

- workspace
- content
- accepted content version
- target platform
- plan status

### Publication

Represents an actual external publication.

A publication references:

- content
- exact immutable content version
- platform
- external URL
- external content ID when available
- connected social account when required
- publication timestamp
- analytics synchronization metadata

One content version may have multiple publication plans and publications.

## Consequences

### Positive

- Correctly models multi-platform intent.
- Publishing queue becomes explicit.
- Analytics can attach to the actual publication.
- Manual V1 publishing can later coexist with automated publishing.

### Negative

- Adds an extra domain entity compared with a simple status field.

## Invariants

- Publication plans target immutable accepted versions.
- Publications reference immutable content versions.
- Analytics belong to publications.
- Registering an external publication does not mutate the published content snapshot.
