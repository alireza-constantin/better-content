# 04: Cut shared Content generation over to V2 mutable Drafts

**What to build:** After the structured editor can consume V2, make all successful Content-generation paths produce a V2 mutable Draft while preserving V1 AI provenance and the existing atomic queue-aware completion transaction.

**Blocked by:** 03 — Replace the textarea with the structured Script block editor.

**Status:** resolved

- [x] Keep provider output and AI Run output snapshot as validated V1 Script documents.
- [x] Keep `AI_GENERATED` Version #1 as the exact V1 creator-work artifact.
- [x] Deterministically create the initial mutable Draft as canonical V2 inside the existing successful-generation transaction.
- [x] Preserve all-or-nothing Content, Version #1, Draft, AI Run, Attempt completion, and Production Queue exit/source-Idea queue-position clearing behavior.
- [x] Apply the same behavior through normal Generate, Retry, and Generate Another shared paths; failed or rolled-back generation must not clear queue membership or leave partial artifacts.

## Required invariants

- Provider execution remains outside the database transaction.
- Runtime cutover occurs only after the editor safely reads V2; this ticket does not alter provider schema or add AI directions.
- The Phase 4 V1 Draft/Version serialization equality is superseded only for new mutable Drafts; historical V1 artifacts remain unchanged.

## Test layer

PostgreSQL integration for atomic completion, queue exit, retry, and rollback; unit/domain for deterministic V1-to-V2 derivation. No Playwright until hardening.
