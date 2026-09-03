# 01 — Define Content Script domain contracts and canonical validation

**What to build:** Establish the provider-neutral and persistence-neutral Phase 4 vocabulary, request schemas, canonical Script document, lifecycle values, fingerprints, failure results, and generated-versus-human validation rules that every later slice consumes.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

## Goal

Make all Phase 4 domain decisions executable as pure, deterministic contracts without introducing persistence, provider, or UI behavior.

## Scope

- Define the exact `content_script_v1` document and strict runtime schemas.
- Define generation request, format, language, lifecycle, failure, retry, quota-source, and immutable-lineage value contracts.
- Define separate generated-output and human-Draft canonicalization.
- Define canonical instruction normalization and the workspace-scoped request fingerprint.
- Extend shared AI metadata types only where Phase 4 requires provider-neutral settings, output, usage, or safe request correlation.
- Reuse existing Phase 2 readiness and Phase 3 lifecycle/error vocabulary instead of duplicating those rules.

## Explicit non-goals

- Database schema or migrations.
- Provider SDK code or prompt prose.
- Application-service orchestration, authorization, quota reservation, pages, or components.
- Directions, blocks, anchors, rich text, Markdown, or any Phase 5 document shape.

## Source-of-truth references

- Phase 4 §§8–10, 14–18, 21, 24–25, 31, and 33.
- PRD §§17–20, 25, 47, and 62.
- Architecture §§16, 20–25, 29A, 30–36, 76, and 90.
- ADR-003, ADR-004, ADR-005, ADR-010, ADR-011, ADR-013, and ADR-016.

## Required behavior

- The document is exactly `{ schemaVersion: 1, script: { text: string } }`; both objects reject unknown keys.
- Generation inputs are exactly workspace, source Idea, base current-DNA version, `en | fa`, `SHORT_VIDEO | LONG_VIDEO`, optional canonical instructions, and an idempotency UUID.
- Instructions outer-trim, blank becomes absent, and nonblank input is at most 1,000 characters.
- Generated text normalizes CRLF/CR to LF, outer-trims, must be non-empty, and must not exceed 50,000 characters; it is never truncated.
- Human Draft text normalizes line endings, preserves all other whitespace, may be empty, and must not exceed 50,000 characters.
- The fingerprint includes only generation kind, source Idea, base DNA version, requested language, format, and canonical instructions/absence. It excludes the key, UI locale, provider/model, prompt, DNA body, and mutable state.
- Application `RATE_LIMITED` results require `WORKSPACE | PROVIDER`; the durable AI failure category remains `RATE_LIMITED`.
- No accepted contract contains Content lifecycle status, `acceptedVersionId`, `resultingContentId`, provider selector, or speculative direction fields.

## Persistence constraints

- Contracts must be compatible with JSONB schema versioning but add no relational document-schema-version concept.
- No raw prompt, DNA body copy, Idea body copy, provider envelope, or raw output type becomes part of a persistence contract.

## Security and authorization requirements

- Treat Script, Idea, DNA, and instructions as untrusted plain Unicode data.
- Validation errors expose stable application categories and no raw provider material.
- Domain inputs carry IDs for later authorization but do not imply ownership.

## EN/FA and RTL/LTR requirements

- Content language is exactly `en | fa` and is independent of UI locale and Idea language.
- Canonicalizers preserve Unicode and mixed-direction text; they never reverse or translate text.

## Acceptance criteria

- [ ] Strict schemas accept only the exact Phase 4 request and `content_script_v1` shapes.
- [ ] Generated and human validation differ exactly on outer whitespace and empty-text behavior.
- [ ] Boundary tests cover 0, 1, 50,000, and 50,001 characters plus LF/CRLF/CR behavior.
- [ ] Fingerprints are stable for canonical-equivalent inputs and change for every included business fact.
- [ ] Tests prove every excluded fingerprint fact has no effect.
- [ ] Lifecycle, failure category, format, language, Version source, and rate-limit-source values are exhaustive and reject unknown values.
- [ ] No Production Direction, block, anchor, rich-text, acceptance, publication, or AI-editing contract is introduced.

## Required tests

- **Unit:** all canonicalization, strict schemas, length boundaries, fingerprints, enums/unions, and plain-text assumptions.
- **Integration:** not required; this ticket is deliberately persistence-neutral.
- **Component:** not required; no UI is introduced.
- **E2E:** not required; covered after application/UI slices exist.

## Dependencies and blockers

- None.
- Blocks Tickets 02 and 03, and supplies shared contracts to every later ticket.

## Expected verification commands

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
git diff --check
```
