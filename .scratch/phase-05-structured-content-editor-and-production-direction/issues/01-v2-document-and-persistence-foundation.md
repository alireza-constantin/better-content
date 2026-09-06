# 01: Establish the V2 Content document and persistence foundation

**What to build:** Enable Better Content to understand validated V1-or-V2 Content documents and the expanded immutable Version lifecycle without changing runtime generation behavior yet.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Add strict V2 document, block, Performance Direction, and Edit Direction contracts with all approved taxonomy, length, count, identity, and canonicalization invariants.
- [x] Add pure V1 segmentation/V2 materialization and canonical document-equality behavior without altering legacy stored Drafts.
- [x] Add reviewed database evolution for V1-or-V2 documents, Version sources, conditional AI Run linkage, and nullable same-Content accepted pointer integrity.
- [x] Preserve every existing V1 artifact and current Phase 4 generation runtime behavior.
- [x] Prove contract behavior at the unit/domain layer and schema/integrity behavior through PostgreSQL integration tests.

## Required invariants

- V2 directions remain embedded JSONB under their owning block; no relational direction rows, range anchors, or unknown fields are accepted.
- A non-null accepted pointer references a Version of the same Content; only application-approved `CREATOR_ACCEPTED` Versions may become current accepted pointers.
- Existing `AI_GENERATED` Version #1 records and V1 AI Run outputs remain immutable and valid.

## Test layer

Unit/domain for validators, canonicalization, transformations, and equality; PostgreSQL integration for migrations and relational invariants. No Playwright.
