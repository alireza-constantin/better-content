# ADR-010: Build English/Persian Internationalization and RTL/LTR Support From Phase 1

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Product Architect / Technical Lead

## Context

English and Persian are V1 requirements.

Persian requires RTL support, while creator content language is independent from application UI language.

Retrofitting RTL after building the application would create widespread layout, spacing, editor, navigation, and component defects.

## Decision

Use `next-intl` for application internationalization.

Initial application locales:

- `en`
- `fa`

Use locale-aware App Router routes under a locale segment.

Conceptually:

- `/en/...`
- `/fa/...`

The application root must set the correct `lang` and `dir`.

English:

- `lang="en"`
- `dir="ltr"`

Persian:

- `lang="fa"`
- `dir="rtl"`

UI locale and creator content language are separate fields/concepts.

Changing UI locale must never translate or mutate creator content.

## Layout rule

Prefer logical layout concepts (`start`, `end`, inline direction) instead of hardcoding left/right assumptions.

RTL behavior must be tested in every UI phase.

## Mixed-direction text

Creator content may contain English and Persian together. The editor must preserve normal Unicode bidirectional behavior and must not manually reverse strings.

## Consequences

### Positive

- RTL becomes foundational instead of corrective work.
- UI language remains independent from content language.
- Future localization remains possible.

### Negative

- Every UI phase requires testing in two directions/locales.
- Some third-party components may require RTL-specific handling.

## Constraints

Codex must not ship UI that works only in English/LTR and defer Persian fixes to a later phase.
