# 06: Deliver Content acceptance and read-only Version History

**What to build:** Let creators approve the current persisted Draft as an immutable Version, retain that approved artifact while continuing to edit, and inspect V1/V2 history safely inside the editor.

**Blocked by:** 04 — Cut shared Content generation over to V2 mutable Drafts; 05 — Deliver block-local Production Direction authoring.

**Status:** resolved

## Status reconciliation

The approved Phase 5 completion record establishes this ticket as completed.
Its original scope and unchecked historical checklist are preserved.

- [ ] Deliver expected-revision acceptance against the authoritative persisted Draft, with canonical equality idempotency for the currently accepted Version only.
- [ ] Create serialized `CREATOR_ACCEPTED` Versions, update the same-Content accepted pointer atomically, and preserve the accepted pointer while later autosaves diverge.
- [ ] Support atomic legacy V1 acceptance migration: checkpoint exact V1 Draft, write V2 Draft, create accepted Version, and update pointer together.
- [ ] Show derived not-accepted, accepted, and unaccepted-changes states; keep acceptance unavailable while the editor is dirty, saving, failed, or conflicted.
- [ ] Deliver compact editor-integrated, read-only Version History and V1/V2 previews that clearly distinguish historical artifacts from the current editable Draft.

## Required invariants

- Concurrent identical acceptance creates one accepted Version; returning to an older non-current document creates a new approval event.
- History is inspection only: no restore, edit, delete, label, diff, branch, or manual snapshot behavior is added.
- `AI_GENERATED` and `LEGACY_DRAFT_CHECKPOINT` are visible historical sources but can never be current accepted pointers.

## Test layer

PostgreSQL integration for acceptance, numbering, pointer integrity, legacy acceptance, authorization, and concurrent races; component tests for gating, state derivation, and read-only history. No Playwright until hardening.
