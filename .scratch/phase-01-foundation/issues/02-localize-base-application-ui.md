# 02: Establish localized EN/FA application routing and base UI

**What to build:** A minimal localized Better Content application surface where users can navigate locale-prefixed routes, see all visible foundation UI in English or Persian, and experience correct LTR/RTL direction.

**Blocked by:** 01: Bootstrap the root Next.js application and developer baseline.

**Status:** resolved

## Phase references

Phase 1 §§25–29, 48–50.

## Implementation skills

- `frontend-design` for the restrained, intentional foundation UI.
- `vercel-react-best-practices` for server/client and routing boundaries.

## Acceptance criteria

- [x] Locale-prefixed routing supports `en` and `fa`, with English as the default locale.
- [x] Translation messages exist for both locales and all visible UI delivered by this ticket is localized.
- [x] English renders with `lang="en"` and LTR direction; Persian renders with `lang="fa"` and RTL direction.
- [x] A minimal locale switcher changes locales without losing the current logical route.
- [x] Base layout uses direction-aware styling and avoids physical left/right assumptions where logical equivalents apply.
- [x] The base UI is responsive and keyboard-accessible.

## Verification

- Add and run focused tests for locale validation and direction selection.
- Verify representative English and Persian routes, including a locale switch on the same logical route.
- Review mobile, tablet, desktop, LTR, and RTL rendering for the delivered base UI.
