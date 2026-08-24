# ADR-004: Store Structured Editor Documents as Versioned JSONB

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Product Architect / Technical Lead

## Context

Better Content is not a plain-text writing tool. Content may contain ordered blocks, text, production signals, timing information, asset references, and future heterogeneous editor elements.

A fully relational representation of every block and signal would create large amounts of schema churn and ordering complexity. A single opaque text field would make structured production instructions impossible to reason about safely.

## Decision

The canonical editor document will be stored as **structured, schema-versioned JSONB**.

Conceptually:

```json
{
  "schemaVersion": 1,
  "blocks": []
}
```

Both mutable drafts and immutable content versions store the structured document.

Production signals are structured objects inside the document model.

The exact signal taxonomy and content-type-specific block schema will be defined before the editor implementation phase.

## Schema evolution

Every document contains `schemaVersion`.

Breaking document-model changes require an explicit transform/migration path, for example:

`Document V1 → transform → Document V2`

Old documents must never silently change meaning.

## Consequences

### Positive

- Natural fit for ordered, nested editor data.
- Easier editor evolution.
- Fewer relational writes for document editing.
- Production signals remain structured.
- Historical versions remain self-contained.

### Negative

- PostgreSQL cannot enforce every nested document invariant itself.
- Strong runtime validation is required.
- Querying arbitrary nested editor details is less convenient.

## Validation

All persisted documents must pass an application schema validator before being accepted as valid domain data.

## Rejected alternatives

### Plain text with markers such as `[ZOOM]`

Rejected because markers are not a reliable canonical data representation.

### Fully relational blocks/signals from V1

Rejected because it introduces unnecessary relational complexity for a document-shaped domain.
