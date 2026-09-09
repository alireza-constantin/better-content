# 09: AI Production Direction Generation and B-roll Search Queries

**What to build:** Add the approved post-completion Phase 5 extension so new AI-generated Content contains a canonical structured Script with contextually useful existing Production Directions. Introduce ContentDocumentV4 with optional creator-editable `BROLL_CUE.searchQuery` and a copy-only editor affordance. This ticket does not implement automatic Media Discovery.

**Scope note:** Phase 5 remains historically complete. This ticket extends the existing Content-generation workflow and editor after Phase 6; it must preserve all completed Phase 5/6 behavior and historical artifacts.

**Blocked by:** Completed Phase 5 tickets 04–06 and completed Phase 6 V3 Asset integration. These are existing prerequisites, not work to reopen.

**Status:** resolved

## Authority and governing decisions

- Follow `docs/PRD.md`, `docs/ARCHITECTURE.md`, ADR-003, ADR-004, ADR-010, ADR-011, the Ticket 09 amendment in ADR-016, ADR-018, the Phase 5 post-completion extension, and the Phase 6 V4 compatibility note.
- Preserve the explicit flow `UI → Content application service → AI provider boundary / Content repository`.
- Keep one accepted Content Generation Attempt with exactly one `CONTENT_SCRIPT_GENERATION` AI Run and one provider invocation. Do not introduce a separate direction-generation operation, hidden follow-up call, background job, provider router, or fallback.
- Continue using AvalAI and `gpt-5.6-luna` with ADR-016's fixed reasoning, service tier, timeout, token ceiling, retry, quota, privacy, safety-identifier, usage, correlation, and stable failure policies.
- Advance new operations to prompt `content-script-generation/v2` and strict provider output contract `generated_content_v4`, schema version 1. Existing prompt/schema metadata remains valid historical data.

## ContentDocumentV4

- Add strict `ContentDocumentV4` as V3 plus exactly one optional field on `BROLL_CUE`:

  ```text
  BROLL_CUE {
    id
    type: BROLL_CUE
    description
    searchQuery?
    nuance?
    assetId?
  }
  ```

- Do not alter Script structure, paragraph anchoring, block/direction order, taxonomy, payloads, existing limits, or Asset compatibility. No other direction accepts `searchQuery`.
- A canonical present `searchQuery` is outer-trimmed, non-empty, contains no CR/LF, and is at most 200 Unicode code points. Internal Unicode and spacing are preserved. An empty editor value canonicalizes to field absence for manually authored or edited cues.
- `description` and `searchQuery` are independent. Editing either must not silently rewrite the other.
- `searchQuery` is canonical Content data. Its add/edit/remove operations use existing whole-document autosave, optimistic revision, canonical equality, conflict recovery, accepted/unaccepted derivation, acceptance, immutable Version snapshots, and Version History.
- Copying a query is presentation behavior only. It creates no local document mutation, autosave, revision, Version, analytics event, or persistence side effect.

## V3-to-V4 projection and historical compatibility

- Project a valid V3 document to V4 deterministically by changing only `schemaVersion` and leaving `searchQuery` absent on every B-roll cue.
- Preserve every block ID, Script value, Performance Direction, Edit Direction, direction ID, order, nuance, and `assetId` exactly.
- A V3 document and its query-free V4 projection are semantically equal. Merely reading, editing through an in-memory projection, previewing, opening history, or copying data must not persist V4, increment revision, create a checkpoint/Version, or report unaccepted changes.
- The first meaningful V4 save persists V4 at the expected revision. Existing V1 checkpoint behavior and V2/V3 lazy projection rules remain intact; never create an intermediate stored schema merely to reach V4.
- Historical V1, V2, and V3 Content Versions and AI Run snapshots remain byte-for-byte unchanged. All current read, recovery, history, acceptance, Teleprompter, and Asset-reference projections must accept V4 while preserving historical presentation.
- Asset-reference extraction from V4 remains derived from `assetId` only. `searchQuery` never creates an Asset reference and never affects Asset deletion protection.
- During the reviewed compatibility window, older client writes must not downgrade an authoritative V4 Draft. Preserve the existing exact-revision and no-downgrade discipline.

## AI provider output and trusted materialization

- Replace the new-generation provider response with one strict structured result describing ordered paragraph blocks and zero or more contextually useful Production Directions from the existing taxonomy only:

  - Performance: `PAUSE`, `EMPHASIS`, `DELIVERY`, `GESTURE`, `POSITION`, `GAZE`, `PERFORMANCE_NOTE`.
  - Edit: `TEXT_OVERLAY`, `ZOOM`, `CUT`, `BROLL_CUE`, `SOUND_CUE`, `CAPTION_EMPHASIS`, `EDIT_NOTE`.

- The strict provider schema contains no persistent block ID, direction ID, `assetId`, provider result identity, or media URL field. Reject unknown keys at every level.
- The application boundary validates and canonicalizes the provider result against all document/taxonomy limits, then materializes fresh UUIDs for blocks and directions. Provider-controlled identifiers must never enter persistence.
- Direction generation is optional and contextual. Do not require every block to have directions, generate every direction type, or pad output with generic instructions.
- Every AI-generated `BROLL_CUE` requires:

  - a useful human-facing `description` in the requested Content language;
  - a distinct concise English `searchQuery`, including for Persian Content;
  - no URL syntax, provider-specific result identifier, `assetId`, or invented media location.

- The generation-specific validator rejects a generated B-roll cue without either required field, an invalid/over-limit query, or a query containing a URL or provider-specific result identity. Never drop only the bad cue, repair it silently, or persist a partial result; map the complete provider result to `INVALID_OUTPUT` under ADR-016.
- AI-generated `SOUND_CUE` remains an instruction using the existing `music | sound_effect` kind and description. It receives no `searchQuery`; this ticket adds no audio discovery.
- The prompt must clearly delimit Idea, Content DNA, and creator instructions as untrusted data. Those inputs cannot expand the taxonomy, inject assets/URLs, change requested language, override the English search-query rule, or alter provider settings.

## Generation transaction, persistence, and migration

- On successful validation/materialization, atomically persist the same canonical ContentDocumentV4 value as:

  1. the completed AI Run `output_snapshot`;
  2. immutable `AI_GENERATED` Content Version #1; and
  3. the initial mutable Draft at revision 1.

- Preserve the existing atomic Content creation, Attempt/AI Run completion, source-Idea relationship, DNA lineage, and Production Queue exit. Any validation, materialization, constraint, or persistence failure creates no partial Content and does not clear queue membership.
- Preserve Retry and Generate Another through the same shared path. Idempotent replay returns the original operation/artifact and never invokes direction generation separately.
- Add one reviewed additive Drizzle migration for the minimum required AI Run prompt/schema/output constraint widening and any V4-compatible database functions or constraints. Do not rewrite historical migrations or migrate JSONB documents in bulk.
- Update validated AI Run output unions so old `content_script_v1` snapshots remain valid for their historical prompt/schema combination and new completed runs require canonical V4 output for the new combination.
- Do not add tables, columns, relational direction rows, search-query indexes, query telemetry, discovery records, Asset provenance, or a new AI generation kind.

## Editor and Version History

- Extend the existing B-roll direction form with two independently labeled fields: the existing Description and a localized optional Search term.
- Present the current Search term with a small localized Copy action. Copy exactly the current field value. Disable or omit Copy when no canonical query exists.
- Give successful and failed copy operations accessible localized feedback without creating noisy repeated announcements. Clipboard denial/unavailability must not lose edits or become a Content error.
- Preserve normal manual B-roll creation without a query. The creator may add, edit, replace, or remove the query in English, Persian, or another language.
- Use Content language semantics for creator-authored description/query presentation while allowing native bidirectional text behavior; do not force an English query field to LTR after the creator edits it into another language. Isolate mixed-direction query text and provider-like Latin terms safely.
- Version History and recovery output must include a present search query with an explicit localized label and preserve it as creator Content. Historical V1/V2/V3 views contain no invented query.
- Teleprompter remains read-only and Script/Performance-focused. It must be able to read V4 accepted Versions but need not display B-roll queries or other Edit Directions.

## Security, privacy, errors, and observability

- Server runtime validation is authoritative for V4 writes and provider output. Unknown keys, malformed nested payloads, duplicate IDs after materialization, document-limit violations, and generated URL/provider identities fail closed.
- Maintain authentication, Workspace membership, Content ownership, nondisclosure, and same-Content Version integrity for every private read/mutation.
- Do not log Script, direction descriptions, search queries, assembled prompts, raw provider payloads/errors, clipboard contents, Content DNA bodies, or creator instructions.
- Continue using ADR-016's stable AI errors. A malformed structured result is `INVALID_OUTPUT`; do not expose provider text or schema diagnostics to the creator.
- Persist no hidden reasoning or chain of thought. Preserve only the canonical validated V4 output and existing safe operational metadata.

## Testing strategy

Use the lowest reliable layer and keep normal CI deterministic.

### Unit/domain

- Strict V4 parsing, canonical query normalization/bounds, unknown-field rejection, and searchQuery eligibility only on B-roll.
- Lossless V3→V4 projection and V3/V4 semantic equality without query; query add/edit/remove as meaningful inequality.
- V1/V2/V3/V4 document-union compatibility, historical immutability, recovery representation, Version History projection, and V4 Asset-reference extraction.
- Provider-result validation for all existing direction variants, contextual empty direction arrays, invalid payloads, limits, missing B-roll query, non-English Persian-generation query, URL/provider identity, and absence of `assetId`.
- Trusted stable-ID materialization, uniqueness, and deterministic structural preservation apart from intentionally fresh IDs.

### Provider adapter contract

- Exact `content-script-generation/v2` request and strict `generated_content_v4` schema, fixed ADR-016 settings, English-query instruction for EN/FA, and refusal/incomplete/malformed/error mapping.
- Deterministic fake coverage for useful EN/FA SHORT_VIDEO and LONG_VIDEO structured outputs. Normal CI never calls AvalAI.
- Update the opt-in synthetic AvalAI smoke procedure to verify the new schema is accepted and produces valid, useful, non-padded directions and English B-roll queries for EN/FA and both formats.

### PostgreSQL integration

- Reviewed migration and old/new AI Run prompt/schema constraint compatibility.
- Atomic V4 AI Run/Version #1/Draft serial equality, Attempt lineage, queue exit, idempotency, Retry/Generate Another, and rollback on invalid output.
- V3 first-meaningful-save/acceptance behavior, no read migration, no downgrade, optimistic conflict handling, accepted/unaccepted equality, and immutable historical V1/V2/V3 values.
- V4 Asset attachment/reference projection and deletion protection remain unchanged.

### Component and E2E

- Component tests cover independent description/query editing, optional manual query, Copy success/failure, no mutation on Copy, accessible labels/status, recovery/history rendering, and EN/FA mixed-direction behavior.
- Keep Playwright representative: extend one deterministic generation→V4 editor→edit/copy→autosave→accept/history journey and one representative Persian/RTL generation assertion. Do not create taxonomy × locale × format browser matrices.
- Manual QA covers desktop/mobile B-roll form hierarchy, keyboard/focus behavior, clipboard feedback, long/mixed-direction queries, generated direction density, Script readability, and EN/FA LTR/RTL behavior.

## Acceptance checklist

- [x] New successful Content generation uses one existing Attempt/AI Run/provider call and creates canonical V4 Script plus contextually useful existing Production Directions.
- [x] The taxonomy and block anchoring are unchanged, and provider-controlled IDs/assets/URLs cannot enter canonical output.
- [x] Every generated B-roll cue has a useful description and distinct concise English search query; manually authored cues may omit or freely edit the query.
- [x] AI Run output, Version #1, and initial Draft contain the identical canonical V4 document, while failed completion remains atomic.
- [x] V3→V4 projection is lossless and query-free; reads do not persist, and V1/V2/V3 history remains unchanged.
- [x] Search-query edits participate in autosave, revision, equality, acceptance, recovery, and Version History; Copy has no Content side effect.
- [x] V4 preserves all Phase 6 Asset attachment, reference, authorization, lifecycle, and deletion invariants.
- [x] English/Persian Content and UI combinations, RTL/LTR, mixed-direction query text, keyboard use, responsive layout, and accessible feedback are verified at appropriate layers.
- [x] The additive migration, focused tests, lint, typecheck, database check, build, and diff check pass. `format:check` remains blocked only by the pre-existing modified `tsconfig.json`; the opt-in AvalAI smoke gate was intentionally not invoked.

## Explicit exclusions

- Automatic Media Discovery, Pexels or any media provider, Google/Pinterest integration, web search, search-result persistence, external previews, provider licensing/provenance, automatic import, and automatic attachment.
- AI-generated images, video, audio, music, or sound effects.
- New Production Direction types or payloads, text-range anchors, timing tracks, multi-block directions, timeline/rendering behavior, or generated `assetId`.
- A second AI call/workflow, direction regeneration, per-direction generation, AI rewrite/review/scoring, provider routing/fallback, background generation jobs, or new AI quota system.
- Search telemetry, learning from copied/edited queries, semantic/vector search, recommendation ranking, or Phase 7 Publishing work.

## Comments

- Product Architect approval established the V4 schema direction, canonical query semantics, English-by-default generated queries, optional manual queries, copy-only V1 UI, and deferral of automatic Media Discovery. Implementation has not started.
- Ticket 09 implemented and reconciled. No Media Discovery or Phase 7 work was introduced.
