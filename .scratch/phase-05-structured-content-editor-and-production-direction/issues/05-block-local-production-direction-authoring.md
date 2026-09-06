# 05: Deliver block-local Production Direction authoring

**What to build:** Let creators manually add, edit, delete, and order approved Performance and Edit Directions directly beneath the Script block they describe.

**Blocked by:** 03 — Replace the textarea with the structured Script block editor.

**Status:** ready-for-agent

- [ ] Deliver typed direction chooser and focused forms for every approved Performance and Edit Direction type, payload, optional-note rule, and bounded text limit.
- [ ] Render compact, Script-secondary direction chips and category summaries; preserve creator order with accessible move actions.
- [ ] Provide desktop popover/dialog behavior and accessible mobile bottom-sheet behavior without a permanent side panel or drag dependency.
- [ ] Persist direction mutations through the existing complete V2 Draft autosave path and retain direction ownership through block split, merge, reorder, and empty-block behavior.
- [ ] Prove direction validation, ordering, interaction, accessibility, content-language presentation, and mobile behavior at appropriate unit/component layers.

## Required invariants

- Directions are creator-authored only; no AI suggestion, generation, auto-application, asset reference, timeline behavior, or generic `OTHER` type is introduced.
- Presentation state such as collapse, selected chip, popover, or bottom sheet never enters the canonical Content document.
- Direction deletion is an explicit secondary action; block deletion safeguards remain those delivered by Ticket 03.

## Test layer

Unit/domain for taxonomy and ordering; component tests for forms, chips, keyboard, sheets, and localized semantic presentation. No Playwright until hardening.
