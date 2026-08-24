# ADR-004: Store Structured Content as Versioned JSONB With Script, Performance Direction, and Edit Direction

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Product Architect / Technical Lead

## Context

Better Content is not a plain-text writing tool.

A Reel/content document must represent three related semantic layers:

1. **Script** — what the creator says or communicates.
2. **Performance Direction** — how the creator performs the Script while recording.
3. **Edit Direction** — how the recorded footage should be edited in post-production.

Examples of Performance Direction include:

- pause
- walking or changing position
- sitting or standing
- gestures
- gaze
- expression
- vocal emphasis
- object interaction

Examples of Edit Direction include:

- zoom
- cut
- image/video overlay
- B-roll
- screenshot
- text
- sound effect
- transition
- picture-in-picture
- timing/emphasis treatment

A fully relational representation of every block and every direction would create substantial ordering and schema complexity.

A single opaque text field would prevent Better Content from understanding production intent structurally.

## Decision

The canonical editor document will be stored as **structured, schema-versioned JSONB**.

Conceptually:

```json
{
  "schemaVersion": 1,
  "blocks": [
    {
      "id": "block-id",
      "script": {
        "text": "Most people are wearing their blazer wrong."
      },
      "performanceDirections": [],
      "editDirections": []
    }
  ]
}
```

This example is conceptual and does not freeze the final editor schema.

The semantic model is:

```text
Structured Content
├── Script
├── Performance Direction
└── Edit Direction
```

Performance Direction and Edit Direction are not separate content types.

They are structured direction layers associated with the same Script.

The umbrella term **Production Direction** refers to:

```text
Production Direction
├── Performance Direction
└── Edit Direction
```

Performance and Edit Directions must remain associated with the relevant Script content.

The exact anchoring representation and exact V1 direction taxonomy are deferred until Phase 5.

Both mutable drafts and immutable content versions store the structured document.

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
- Production Directions remain structured.
- Historical versions remain self-contained.

### Negative

- PostgreSQL cannot enforce every nested document invariant itself.
- Strong runtime validation is required.
- Querying arbitrary nested editor details is less convenient.

## Validation

All persisted documents must pass an application schema validator before being accepted as valid domain data.

## Rejected alternatives

### Plain text with markers such as `[ZOOM]` or `[WALK]`

Rejected because markers are not a reliable canonical data representation.

### Separate Performance Content and Edit Content entities

Rejected because Performance Direction and Edit Direction describe the same underlying Script rather than separate content.

### Fully relational editor blocks/directions in V1

Rejected because it introduces unnecessary relational complexity for a document-shaped domain.
