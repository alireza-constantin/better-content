# 02: Deliver V2 Draft persistence and lazy legacy migration

**What to build:** Let authorized creators safely persist complete V2 Draft documents, while legacy V1 Drafts project read-only into V2 and migrate only after meaningful creator action without losing their exact stored V1 value.

**Blocked by:** 01 — Establish the V2 Content document and persistence foundation.

**Status:** resolved

- [x] Extend the authorized Draft save/read application boundary to support whole validated V2 documents, existing revision conflicts, and V1-or-V2 reads.
- [x] Preserve one-in-flight/coalesce-latest autosave semantics at the application contract boundary without patch, operation-log, CRDT, merge, or offline-queue behavior.
- [x] On the first meaningful V2 save of a V1 Draft, atomically create one exact `LEGACY_DRAFT_CHECKPOINT`, replace the Draft with canonical V2, and advance revision.
- [x] Return stable no-write validation failure when a legacy projection exceeds structural limits; preserve complete local conflict recovery and readable export contracts.
- [x] Prove authorization, migration atomicity, rollback, conflicts, and no-duplicate-checkpoint behavior through PostgreSQL integration tests.

## Required invariants

- Opening/projecting a V1 Draft never writes or marks it dirty merely because schemas differ.
- Server validation and canonicalization are authoritative; a conflict or migration failure creates neither checkpoint nor partial V2 Draft.
- Copy-unsaved behavior is a localized human-readable recovery export, not JSON or an import format.

## Test layer

Unit/domain for projection/export rules; PostgreSQL integration for persistence, authorization, conflicts, and atomic migration. No Playwright.
