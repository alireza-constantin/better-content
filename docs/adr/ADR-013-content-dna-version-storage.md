# ADR-013: Content DNA Version Storage

- **Status:** Accepted
- **Date:** 2026-08-31
- **Decision owners:** Product Architect / Technical Lead

## Context

Content DNA is creator-specific context that changes over time and must remain traceable to the exact version used by future AI generation.

ADR-003 establishes the versioning strategy: a stable Content DNA aggregate with immutable historical versions. This ADR clarifies the canonical container name and how Content DNA version bodies are persisted. It does not replace ADR-003.

The earlier `content_dna_profile` / `content_dna_profiles` terminology refers to the same stable aggregate. The canonical domain and persistence-container name is now `content_dna`; it is not a second concept.

## Decision

Content DNA uses:

- one relational `content_dna` container per workspace;
- immutable `content_dna_versions`;
- version bodies stored as application-validated JSONB snapshots;
- `schemaVersion` stored only inside the JSONB payload; and
- relational columns reserved for stable persistence concerns: identity, workspace ownership, lineage, sequential version number, current-version reference, author, and timestamps.

Do not add a duplicate relational `schema_version` column.

Conceptually:

```text
Workspace
  ↓
Content DNA
  ↓
immutable Content DNA Versions
  ↓
one current version
```

Historical payloads are immutable and self-describing. Future schema evolution must use explicit schema-aware interpretation, migration, or transformation logic. Existing historical payloads must never silently change meaning.

## Rationale

JSONB is the appropriate representation for a Content DNA version body because it provides:

- self-contained immutable snapshots;
- exact Content DNA version references for future AI lineage;
- controlled schema evolution;
- no relational migration for every evolution of creator-description fields; and
- an explicit application-validation boundary.

This is not permission to store arbitrary domain data as JSONB. The decision applies specifically to Content DNA version bodies, whose structured, creator-defined fields evolve together as a snapshot.

## Consequences

### Positive

- A historical version contains the full context that future generation records can reference.
- Payload changes can evolve deliberately without decomposing every creator-description field into a new relational migration.
- The snapshot remains independent of how a future AI prompt is constructed.
- Stable ownership and lineage remain enforceable through relational keys and constraints.

### Negative

- Zod/application schemas must validate a payload before persistence.
- Querying individual payload fields is less convenient than querying typed relational columns.
- Indexes on JSON expressions may be added later only when evidence justifies them.
- Reading historical payloads requires schema-version-aware interpretation.

## Constraints

- The payload's `schemaVersion` is authoritative for interpreting that payload.
- Version payloads must never be updated in place.
- Individual historical-version deletion is not a normal Content DNA domain
  operation and is not supported in Phase 2.
- Future workspace/account deletion or retention requirements may remove
  historical records only through an explicitly designed lifecycle policy;
  this ADR does not define that policy.
- Relational columns must not duplicate mutable creator-description fields from the payload.
- The current-version reference must identify a version belonging to the same `content_dna` container.
- A future breaking payload change requires explicit migration or transform logic; it must not silently reinterpret V1 data.
