# ADR-005: Derive `USED` and `PUBLISHED` Instead of Storing Them as Exclusive Aggregate States

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Product Architect / Technical Lead

## Context

The PRD describes user-facing states including `USED` for ideas and `PUBLISHED` for content.

Those labels are useful in the UI, but storing them as exclusive database states would create contradictions.

An accepted idea can also already have generated content. A single content item can be published on Instagram while still waiting for publication on TikTok.

## Decision

### Ideas

Persist decision state such as:

- `new`
- `accepted`
- `saved`
- `rejected`

`Used` is derived from whether content exists with that idea as its source.

### Content

Persist content authoring/approval state separately from publication state.

Content may be draft or have an accepted version.

`Published` is derived from the existence/status of one or more publication records.

## Consequences

### Positive

- Avoids contradictory duplicated state.
- Supports multiple publications per content item.
- Better represents real domain facts.
- Simplifies future multi-platform behavior.

### Negative

- Some list screens require joins/derived queries.
- UI state labels are not always identical to database columns.

## Rule

Do not add `idea.status = used` or `content.status = published` merely for UI convenience.

If denormalization is later needed for performance, it requires an explicit consistency design.
