# Better Content — Phase 02: Content DNA

**Status:** Ready for implementation
**Phase:** 02
**Date:** 2026-08-31
**Owner:** Product Architect / Technical Lead

---

# 1. Purpose

Implement the first creator-specific product domain: a workspace owner can create and maintain a structured Content DNA with immutable version history and one atomic current version.

At the end of Phase 2, future systems can consume an exact immutable Content DNA version. Phase 2 performs no AI provider calls and generates no ideas.

---

# 2. Source of Truth

Before implementation, read:

```text
AGENTS.md
docs/PRD.md
docs/ARCHITECTURE.md

docs/adr/ADR-001-modular-monolith.md
docs/adr/ADR-002-authentication-and-workspaces.md
docs/adr/ADR-003-versioning-strategy.md
docs/adr/ADR-010-internationalization.md
docs/adr/ADR-012-drizzle-migrations.md
docs/adr/ADR-013-content-dna-version-storage.md
```

ADR-013 is a Content-DNA-specific clarification of ADR-003. `content_dna` is the canonical stable container name; earlier `content_dna_profile` terminology denotes that same container and must not produce a second concept or table.

If this phase specification conflicts with the PRD, Architecture, or an Accepted ADR, stop the conflicting implementation and request an architectural/product decision.

---

# 3. Goals

Phase 2 must provide:

- one Content DNA container for each workspace;
- explicitly saved, immutable Content DNA versions;
- one atomically updated current version;
- partial-payload persistence with a separately derived AI-readiness result;
- server-side workspace-owner authorization;
- optimistic concurrency protection for saved versions;
- localized English/Persian editor and read-only version history; and
- exact version lineage for future phases without implementing those phases.

---

# 4. Explicitly Out of Scope

Phase 2 must not implement:

- idea generation, ideas, prompts, AI providers, `ai_runs`, or actual AI calls;
- content generation or editing, Script, Performance Direction, or Edit Direction;
- autosave, persisted server drafts, collaborative editing, merge UI, drag-and-drop ordering, DNA diffs, version restore, version forking, or version deletion;
- tag taxonomies, global enums for creator-defined lists, automated PII detection, moderation, or AI learning;
- content languages other than `en` and `fa`;
- publishing, social connections, analytics, assets, background jobs, teams, or workspace switching.

---

# 5. Domain Model

```text
Workspace
  ↓
Content DNA
  ↓
immutable Content DNA Versions
  ↓
one current version
```

Content DNA is a workspace-owned container, not a mutable profile body. Each successful meaningful save creates a complete immutable snapshot. A future idea-generation batch will reference the exact `content_dna_versions` record it used.

There is no persisted lifecycle or status enum. The server derives the current Content DNA state from the current payload:

- `NOT_CREATED` — no `content_dna` exists for the workspace;
- `INCOMPLETE` — a current version exists but is not AI-ready; or
- `AI_READY` — a current version satisfies the canonical readiness rule.

---

# 6. Database Model and Invariants

Use UUIDs and the repository's existing timestamp and Drizzle conventions.

Conceptually:

```text
content_dna
├── id
├── workspace_id
├── current_version_id
├── created_at
└── updated_at

content_dna_versions
├── id
├── content_dna_id
├── version_number
├── payload JSONB
├── created_by_user_id
└── created_at
```

Required invariants:

- Exactly one `content_dna` container may exist per workspace.
- `(content_dna_id, version_number)` is unique.
- A version belongs to exactly one Content DNA container.
- `current_version_id` is either absent before the first successful save or references a version belonging to the same container.
- Versions are immutable and are never deleted in Phase 2.
- Only an authenticated owner of the containing workspace may mutate Content DNA.
- Historical versions remain read-only and available, including incomplete versions.

The implementation must express important relational invariants with database keys, foreign keys, unique constraints, and database-backed integrity protection where practical. In particular, migration design must protect the same-container current-version relationship and version immutability; application checks alone are not sufficient for ownership or uniqueness.

A `content_dna` container is not persisted merely by opening the editor.

The first successful save atomically establishes:

- the `content_dna` container,
- version 1, and
- the current-version reference.

A committed Content DNA container must therefore have a current version.
A temporarily unset pointer may exist only if required internally by the
database transaction used to establish the first version and must not escape
as committed domain state.


---

# 7. V1 Payload Contract

Each `content_dna_versions.payload` is a JSONB object with `schemaVersion: 1` and the following structured sections. Fields other than `schemaVersion` may be omitted so a partial Content DNA can be saved.

```text
schemaVersion: 1

identity
└── creatorOrBrandDescription

audience
└── targetAudienceDescription

expertise
└── primaryTopics

voice
├── toneTraits
└── preferredStyle?

goals
└── contentGoals

preferences
├── preferredFormats?
├── topicsToAvoid?
├── approachesToAvoid?
└── additionalInstructions?

language
├── defaultContentLanguage
└── contentLanguages
```

`defaultContentLanguage` and values in `contentLanguages` are limited to `en` and `fa`. When a default content language is present, `contentLanguages` must also be present and contain that language. Content-language preferences are independent of UI locale and must never be inferred from, translated by, or changed when the UI locale changes.

Creator-defined lists are plain strings, not global taxonomies or enums.

All list order is preserved in the immutable payload for round-trip fidelity.

For `primaryTopics`, `toneTraits`, and `contentGoals`, order additionally
expresses priority: the first item has the highest priority.

Other lists must not be assigned priority semantics merely from their order.

Approved limits:

| Field | Limit |
| --- | --- |
| `creatorOrBrandDescription` | 1,500 characters |
| `targetAudienceDescription` | 1,500 characters |
| `primaryTopics` | maximum 10 items; 80 characters each |
| `toneTraits` | maximum 5 items; 60 characters each |
| `preferredStyle` | 1,200 characters |
| `contentGoals` | maximum 5 items; 120 characters each |
| `preferredFormats` | maximum 8 items; 80 characters each |
| `topicsToAvoid` | maximum 10 items; 120 characters each |
| `approachesToAvoid` | maximum 10 items; 160 characters each |
| `additionalInstructions` | 2,000 characters |

`schemaVersion` belongs only in the payload. Do not add a duplicate relational `schema_version` column.

---

# 8. Validation and Readiness

Server-side Zod/application validation is authoritative. Client-side validation may improve the editor experience but cannot authorize or validate persistence.

## Storage validity

A payload can be saved when it has the required shape, `schemaVersion: 1`, permitted content-language values, and every supplied field satisfies its type and approved limits. Optional sections and fields may be absent. Supplied lists must satisfy their list constraints.

## AI readiness

One canonical server-side readiness function must be the only source for both the Phase 2 UI status and Phase 3 generation gating. A stored payload is AI-ready only when it contains:

- `creatorOrBrandDescription`;
- `targetAudienceDescription`;
- 1–10 `primaryTopics`;
- 1–5 `toneTraits`;
- 1–5 `contentGoals`;
- `defaultContentLanguage`;
- at least one `contentLanguage`; and
- a `defaultContentLanguage` that belongs to `contentLanguages`.

The UI may show an incomplete current or historical version, but must not introduce a stored readiness/status field.

---

# 9. Normalization

Normalize before validation, equality comparison, and persistence.

## Free text

- Trim outer whitespace.
- Normalize line endings to `\n`.
- Preserve meaningful paragraphs and internal whitespace.
- Preserve casing and Persian, English, and mixed-language prose.

## Lists

- Trim every entry.
- Reject empty entries.
- Preserve entered order.
- Apply the approved maximum item count and character limits.
- Deduplicate case-insensitively, retaining the first-entered display casing.

List order is semantically meaningful. Reordering an otherwise identical list is a Content DNA change and must produce a new version when saved against a current base version.

## Empty values and canonical absence

Content DNA snapshots must have one canonical representation for unanswered
optional values.

Before validation, equality comparison, and persistence:

- text values that become empty after trimming are treated as absent;
- empty lists are treated as absent;
- empty nested sections are omitted;
- unsupported/unknown keys are rejected rather than persisted.

Examples:

- `"   "` → absent
- `""` → absent
- `[]` → absent
- `{}` → absent when the whole section contains no persisted values

This prevents semantically identical payloads from producing different
immutable versions solely because one payload contains empty strings, empty
arrays, or empty objects.

Normalization must not silently repair logically inconsistent language values.
For example, if `defaultContentLanguage` is present, `contentLanguages` must
also be present and contain it; otherwise storage validation fails.



---

# 10. Save and Concurrency Semantics

Saving is explicit. There is no autosave and no persisted mutable draft. The browser may retain unsaved local form state.

Every save request carries:

```text
baseVersionId: UUID | null
```

Canonical save flow:

```text
Authenticated user
  ↓
Authorize workspace owner
  ↓
Normalize + storage validate
  ↓
Begin short database transaction
  ↓
Serialize Content DNA mutation for the workspace
  ↓
Obtain/create container and lock/re-read current version
  ↓
Compare current version ID with baseVersionId
```

If `baseVersionId` does not equal the current version ID, return the stable application error category `CONFLICT`. Create no version and preserve browser-local unsaved edits.

If it matches, compare normalized payloads:

- if identical, return the existing current version and create no new version;
- if changed, assign the next sequential version number, insert one immutable version, atomically update `current_version_id`, and commit.

The first-save case has no existing Content DNA row to lock. The implementation must use a database-backed workspace-scoped serialization or equivalent conflict-safe strategy (for example, a transaction-scoped PostgreSQL advisory lock) before obtaining or creating the container. The unique workspace constraint remains the integrity backstop.

Concurrent first saves must never create two containers, duplicate version numbers, or inconsistent current-version pointers. Concurrent updates must serialize so sequential version numbers are correct.

Example stale-editor behavior:

```text
Tab A loads v4; Tab B loads v4
Tab A saves v5
Tab B saves with baseVersionId v4
  ↓
CONFLICT; no v6 is created
```

Do not silently overwrite, auto-merge, or create a version from stale state. Phase 2 provides only an actionable localized conflict message and a path to reload the latest version.

---

# 11. Authorization

Every private Content DNA operation must verify server-side authentication and
workspace access.

Read operations require:

Authenticated user
+
workspace membership
+
Content DNA owned by that workspace

Mutation operations require:

Authenticated user
+
workspace owner membership
+
Content DNA owned by that workspace

Never treat browser-provided workspace IDs, user IDs, Content DNA IDs, or
version IDs as proof of authorization.

An unrelated user must not learn, read, or mutate another workspace's Content
DNA or version history.

Phase 1 currently exposes only owner memberships, so these boundaries resolve
to the same user behavior in V1. Phase 2 must nevertheless preserve the
read-versus-mutation distinction and must not introduce a generalized RBAC
framework.

---

# 12. Editor and History UX

Phase 2 provides:

- a Content DNA empty state;
- a structured localized editor;
- ordered-list editing with accessible move-up and move-down controls;
- an explicit **Save Content DNA** action;
- a dirty/unsaved indication;
- a practical warning before abandoning unsaved work;
- readiness status;
- read-only version history;
- read-only version detail;
- stale-save conflict handling; and
- a localized privacy notice.

Do not add drag-and-drop solely for list ordering. Do not build sophisticated navigation-interception machinery just for dirty-state handling.

History must list every successfully persisted version, including incomplete versions, and derive each version's completeness from its own immutable payload. It must communicate the current version and its readiness, for example:

```text
Version 5 — Current — AI-ready
Version 4 — Incomplete
Version 3 — AI-ready
```

Historical versions can be viewed but cannot be edited, restored, forked, or deleted. A future restore operation may create a new version by copying a historic payload; that behavior is explicitly deferred.

---

# 13. Internationalization and Accessibility

All visible Phase 2 UI must be localized in English and Persian through the existing `next-intl` foundation.

The feature must preserve locale-prefixed routes such as `/en/...` and `/fa/...`, correct document language/direction, and session-preserving locale switching. English remains LTR and Persian remains RTL. Use logical-direction styling and verify ordered-list controls, labels, navigation, focus behavior, and version-history presentation in both directions.

Creator Content DNA text may be English, Persian, or mixed-language prose. Preserve normal Unicode bidirectional behavior; do not reverse strings or conflate content language with the interface locale.

The editor must use semantic controls, accessible labels, keyboard-reachable move controls, visible focus states, and localized validation/error feedback.

---

# 14. Security, Privacy, Observability, and Errors

Content DNA can contain sensitive creator context. Do not write payload values to normal application logs, telemetry by default, or validation-error output.

Show a localized notice asking users not to enter unnecessary sensitive information, including credentials, secrets, government identifiers, precise private addresses, or private third-party information. Do not implement automated PII detection, sensitive-data classification, or AI moderation/scanning in this phase.

Use existing structured server-side logging and stable application error categories. Logs may include safe operational context such as request ID, workspace ID, user ID, module, operation, entity ID, and error code, but not Content DNA payload values. Expected errors include `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, and `INTERNAL_ERROR`; user-facing text must be localizable.

---

# 15. Migrations

Phase 2 database changes must use reviewed, committed Drizzle migrations. Do not use `drizzle-kit push` as the production migration mechanism and do not manually alter production schema.

The migration must introduce only the approved Content DNA persistence model and its necessary constraints/indexes. It must not modify historical migrations or add schema for future AI, ideas, content, publishing, analytics, jobs, assets, or teams.

---

# 16. Testing Strategy

Use deterministic unit tests, PostgreSQL-backed integration tests, and focused Playwright coverage. Maintain the existing test-database safeguards; tests must not use production data or real external services.

At minimum, cover:

- first Content DNA creation;
- the one-container-per-workspace invariant;
- owner authorization and unrelated-user denial;
- partial persistence;
- the canonical readiness rule;
- normalization, case-insensitive list deduplication, and list-order preservation;
- identical saves producing no new version;
- changed saves producing version `N + 1`;
- stale `baseVersionId` returning `CONFLICT`;
- concurrent first saves and concurrent updates/sequential numbering;
- immutable historical versions and current-version-pointer correctness;
- English/Persian editor rendering, LTR/RTL behavior, and session-preserving locale switching;
- history rendering and practical dirty-state behavior; and
- the E2E create → save → edit → history flow.
- canonical empty-value normalization and unknown-key rejection;
g
---

# 17. Acceptance Criteria

Phase 2 is complete only when all of the following are true.

## Domain and persistence

- [ ] A workspace has at most one `content_dna` container.
- [ ] Content DNA versions are immutable JSONB snapshots with `schemaVersion` only inside the payload.
- [ ] Stable ownership, lineage, version number, current-version reference, author, and timestamp concerns are relational.
- [ ] The current-version pointer cannot reference a version from another Content DNA container.
- [ ] Every changed successful save creates exactly one next sequential version and atomically makes it current.
- [ ] An identical normalized save creates no version.
- [ ] Incomplete and AI-ready payloads are both persistable when storage-valid.
- [ ] No persisted readiness or lifecycle status enum exists.

## Validation and concurrency

- [ ] Server-side normalization and storage validation enforce the approved payload contract and limits.
- [ ] One canonical server-side readiness function drives UI status and future generation gating.
- [ ] Reordering `primaryTopics`, `toneTraits`, or `contentGoals` is treated as a meaningful priority change.
- [ ] Stale saves return `CONFLICT` without overwrite, merge, or a new version.
- [ ] First-save and update concurrency preserve container uniqueness, version sequencing, and current-pointer correctness.
- [ ] Empty strings, empty lists, and empty sections normalize to canonical
    absence, and unknown payload keys are rejected.

## Authorization, UX, and i18n

- [ ] Only authenticated workspace owners can save Content DNA.
- [ ] Users cannot read or mutate another workspace's Content DNA or history.
- [ ] English and Persian editor/history UI works at `/en/...` and `/fa/...` with correct LTR/RTL behavior.
- [ ] Locale switching preserves the authenticated session and never changes Content DNA language preferences.
- [ ] The editor provides explicit save, dirty indication, accessible ordered-list controls, localized privacy notice, conflict feedback, and read-only history/detail views.

## Quality

- [ ] Reviewed Drizzle migration(s) exist and apply cleanly to the test database.
- [ ] Required unit, integration, and E2E tests pass.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, required Playwright tests, and `git diff --check` pass.

---

# 18. Deferred Decisions and Features

The following remain intentionally deferred:

- future Content DNA payload schemas and their explicit migration/transform paths;
- exactly how future AI prompts consume an AI-ready immutable Content DNA version;
- Content DNA restore/fork and comparison/diff UX;
- additional content languages;
- taxonomy or suggestion systems for creator-defined lists;
- collaborative editing and merge behavior;
- automated privacy classification or moderation; and
- all later product modules listed as out of scope for this phase.
