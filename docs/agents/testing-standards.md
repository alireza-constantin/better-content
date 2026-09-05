# Automated Testing Standards

These standards apply to Better Content implementation tickets and test-suite
changes. They supplement the PRD, Architecture, accepted ADRs, phase
specifications, and `AGENTS.md`; those sources remain authoritative.

## Core rule

**Use the lowest test layer that can reliably prove the behavior.**

**E2E tests are reserved for critical cross-boundary user journeys and should
not duplicate exhaustive unit/integration/component coverage.**

The aim is confidence, not test-count targets or an acceptance-criterion-per-
browser-test matrix.

## Test-layer responsibilities

| Layer | Proves |
| --- | --- |
| Unit/domain | Pure rules, transformations, parsing, validation boundaries, canonicalization, and state machines. |
| Component | Meaningful browser-component interaction, localized copy, semantic `lang`/`dir`, field errors, focus, and accessible presentation without the full application stack. |
| PostgreSQL integration | Persistence, repositories, authorization, transactions, migrations, lineage, idempotency, locking, concurrency, and database constraints. |
| Playwright E2E | A small set of critical browser → application → database journeys, including navigation and deterministic provider wiring. |
| Manual product/UX QA | Visual hierarchy, typography, spacing, responsive feel, animation and drag feel, content readability, and other subjective design quality. |

Server validation and authorization remain authoritative. Test concurrency at the
PostgreSQL integration layer; use two-browser conflict coverage only when the
conflict recovery experience itself is critical.

## E2E selection

Keep an E2E test when it demonstrates a critical cross-boundary journey or a
browser behavior that cannot be reliably proved below. Typical Better Content
examples are sign-in to a protected surface, generation through the deterministic
provider seam to a persisted editor, queue reorder surviving refresh, an
observable safe failure followed by Retry, and one representative Persian/RTL
journey.

Do not use E2E for every validation boundary, enum/status, malformed input,
authorization permutation, repository condition, queue conflict, migration
invariant, race, error mapping, locale/viewport combination, or exact visual
property. Put deterministic behavior at its appropriate lower layer. Never make
live providers part of normal E2E.

Before removing or consolidating an E2E test, identify its behavior and retain
or add equivalent lower-level coverage. Remove obsolete tests rather than
leaving intentionally skipped browser tests.

## Locale, responsive, and visual QA

Component tests cover semantic localization and direction. E2E retains a small
representative English/LTR and Persian/RTL journey; it must not form a feature ×
locale × viewport matrix. Automated UI checks may assert robust objective
invariants such as reachability, dialogs, focus, visible actions, semantic
direction, and no horizontal overflow.

Major user-facing phases require concise manual QA for representative English
desktop, Persian desktop, English mobile, Persian mobile, mixed-direction
creator content, long Persian titles/content, queue drag behavior, and editor
usability. Manual QA is complementary and is unnecessary for domain-only work.

## Ticket-writing rule

Implementation-ready tickets must name the required behavior, important
invariants, and the appropriate test layer. Their E2E section stays short and
lists only critical journeys. Do not turn every acceptance criterion into a
Playwright requirement or weaken the underlying requirement when assigning it to
a lower layer.
