# 08: Deliver Teleprompter / Recording Mode

**What to build:** Add the approved post-completion Phase 5 extension that lets a creator read an immutable accepted Content Version in an immersive Teleprompter / Recording Mode. This ticket adds no recording system; it provides the read-only prompting surface and ephemeral browser controls.

**Scope note:** Phase 5 remains historically complete. This is a post-completion extension and must not rewrite the historical Phase 5 scope, acceptance record, or completed ticket history.

**Blocked by:** Phase 5 tickets 05 — Deliver block-local Production Direction authoring; 06 — Deliver Content acceptance and read-only Version History. Those capabilities are existing prerequisites, not work to reopen in this ticket.

**Status:** resolved

## Authority and architecture

- Reuse the existing Content read, acceptance, Version History, workspace-membership, and locale-route boundaries. The relevant authority is ADR-001, ADR-002, ADR-003, ADR-004, ADR-010, the security boundaries in `docs/ARCHITECTURE.md`, and the Phase 5 post-completion extension section.
- The production flow is `Mutable Draft → Accept → immutable Content Version → Teleprompter`.
- The server authorizes the request, resolves the Content aggregate and its current `acceptedVersionId`, loads that immutable Version, validates/projects its document through the existing Content presentation rules, and returns a safe read-only Teleprompter DTO.
- React Teleprompter components receive only the DTO and own browser interaction state. They must not import the database, repositories, or server-only authorization code.
- Do not add a `RecordingSession` domain/table, persistence for Teleprompter preferences, a new application shell, a new Performance Direction taxonomy, or any mutation to `ContentDocumentV3`.

## Required server and entry behavior

- Add a dedicated immersive locale-aware route/view using the existing Next.js App Router architecture. The route may be nested under the existing Content detail route, but it must retain the current locale, `lang`, `dir`, session, and workspace boundaries.
- Expose an exact **Open Teleprompter** action from the normal Content detail/editor surface when `acceptedVersionId` is non-null. The action opens the normal entry point for the Content's current accepted Version; it must not accept a client-selected arbitrary Version as its authority.
- If the Content has no accepted Version, do not open a Draft-backed teleprompter. Keep the action unavailable or replace it with localized guidance telling the creator to accept the Content first.
- Require the existing private-read authorization boundary: authenticated user, membership in the owning Workspace, and ownership of the requested Content through that Workspace.
- A foreign Workspace, non-member, or otherwise unauthorized Content request must use the existing nondisclosing behavior. It must not reveal whether the Content, Draft, or Version exists.
- If `acceptedVersionId` is missing, does not belong to the requested Content, is not a valid immutable Version, or is not a `CREATOR_ACCEPTED` Version, fail closed. Do not render Draft content, stale cached content, a partial Version, or an error that discloses the invalid foreign identity. For an authorized Workspace member, show a stable localized accepted-Version-unavailable state and log only safe invariant/correlation information server-side.
- The normal entry point must resolve the accepted pointer on every server load. Draft edits after acceptance must not change the DTO or the displayed Script. Re-accepting a new Version must make the next normal entry point render that new accepted Version.
- The DTO must be read-only and presentation-focused: Content identity needed for the view, accepted Version identity/number if displayed, Content language, ordered Script blocks, and safe existing Performance Direction presentation data. Do not expose database rows, mutable Draft data, asset capabilities, secrets, or unrelated Version History data merely for convenience.

## Required V1 rendering behavior

- Render Script text in exact stored block order, preserving text content and mixed Persian/Latin Unicode behavior. Do not manually reverse or translate creator content.
- Render the existing Phase 5 Performance Direction variants only: `PAUSE`, `EMPHASIS`, `DELIVERY`, `GESTURE`, `POSITION`, `GAZE`, and `PERFORMANCE_NOTE`.
- Keep each Performance Hint associated with and adjacent to its owning Script block. The Script is the visually dominant reading content; hints are visually secondary but clearly distinct.
- Hints must never be interpreted as spoken Script. Use semantic structure, explicit labels, and non-color-only distinction. When hints are hidden, the Script remains complete and readable.
- V1 does not render Edit Directions as spoken content and does not add Edit Direction editing, playback, or media behavior. Existing Edit Directions may be omitted from the Teleprompter projection.
- Preserve compatibility with accepted V1, V2, and V3 historical documents according to the current Content read/presentation adapters. A V1 accepted document projects to its Script as one readable block with no Performance Hints; V2/V3 projects its ordered blocks and existing Performance Directions without migration or write-back.
- Optimize the reading surface for distance readability rather than editor density: centered readable line width, generous line height and block spacing, strong Script typography, responsive gutters, and no horizontal overflow on phone, tablet, or laptop/desktop.
- Use a readable line measure with a bounded maximum (target approximately `60ch`) and responsive minimum gutters. The implementation must keep the control interface usable at large text sizes.

## Required V1 controls and exact behavior

- **Start/play:** The initial state is paused. Activating Start/Play begins the V1 countdown, then continuous auto-scroll. The control becomes Pause while scrolling and Resume after a pause.
- **Pause:** Stop auto-scroll immediately, cancel any active countdown, keep the current scroll position, and make the paused state observable to assistive technology.
- **Manual scrolling:** The reading surface remains normally scrollable by touch, pointer, scrollbar, and keyboard. A manual scroll during countdown cancels the countdown and pauses auto-scroll; a manual scroll during active auto-scroll also pauses it so user input and automatic movement never compete.
- **Continuous auto-scroll:** Use one cancellable frame/timer loop whose movement is based on elapsed time, not repeated unbounded timers. It must stop at the end of the reading surface and expose completion without looping back.
- **Adjustable speed:** Provide an accessible ephemeral speed control with a bounded range of `0.25×` through `3×`, a `0.25×` step, and a `1×` default. Changes take effect without resetting the Script or scroll position.
- **Adjustable text size:** Provide an accessible ephemeral text-size control with a bounded range of `1×` through `2.5×`, a `0.1×` step, and a `1.4×` default. It must not hide or disable essential controls at the largest size.
- **Restart / return to beginning:** Stop playback/countdown, return the reading surface to the beginning, reset progress to zero, and leave the surface paused. Respect `prefers-reduced-motion` by using an immediate scroll when reduced motion is requested.
- **Countdown:** Use a visible and announced three-second countdown (`3`, `2`, `1`) before auto-scroll starts. It must have a keyboard- and button-accessible cancel/pause path, must not trap focus, and must not prevent the user from reaching or operating other controls.
- **Progress:** Expose a determinate progress indicator based on the reading surface's scroll range, from zero at the beginning to 100% at the end, with a text/accessible value that does not rely solely on color.
- **Performance Hints visibility:** Provide an accessible toggle with a stable label and pressed state. Turning it off hides Performance Hints only; it never removes, alters, or reorders Script text.
- **Mirror mode:** Provide an accessible toggle that visually mirrors only the teleprompter reading surface/stage for physical teleprompter glass. The settings/control interface, focus order, labels, buttons, progress, and status must remain readable and usable. With mirror mode off, ordinary English LTR and Persian RTL behavior remains unchanged.
- **Fullscreen:** Request fullscreen for the immersive reading surface where the browser permits it; synchronize state with `fullscreenchange`; expose a graceful localized unsupported/failed state without blocking prompting. Fullscreen exit must remain discoverable through the browser and an accessible in-app control where available.
- **Keyboard operation:** Do not hijack typing in controls or editable elements. At minimum support: `Space` or `K` play/pause; `Home` restart; `ArrowUp`/`ArrowDown` small manual scroll; `PageUp`/`PageDown` viewport scroll; `M` mirror; `H` Performance Hints toggle; `+`/`-` text-size adjustment; `[`/`]` speed adjustment; and `Escape` to cancel countdown or leave fullscreen when applicable. All visible controls must also work as semantic buttons/inputs with keyboard focus.
- **Wake Lock:** Request `navigator.wakeLock.request("screen")` when active auto-scroll begins or resumes, retain the sentinel only while needed, release it on pause, completion, route unmount/navigation, or explicit exit, and retry after a visible `visibilitychange` when playback is still active. Unsupported, denied, or failed Wake Lock must degrade silently to normal screen behavior with localized non-blocking status; it must never stop or corrupt the prompt.

## Internationalization, accessibility, and responsive acceptance

- Support English/LTR and Persian/RTL through the existing `next-intl` route and root semantics. UI labels use the UI locale; Script and creator-authored Performance Note text use the Content language.
- Apply logical CSS properties. Mixed Persian/Latin Script and hint text must use browser bidi behavior (`dir="auto"`/appropriate semantic direction) without string reversal or UI-locale translation.
- Use semantic buttons, labeled controls, visible focus, meaningful accessible names, status/live feedback for countdown/playback/errors, and no color-only hint distinction.
- Keep countdown operation cancellable and non-trapping. Respect reduced motion for restart/scroll behavior and avoid decorative motion when `prefers-reduced-motion` is active.
- Ensure the reading surface and controls work on phone, tablet, and laptop/desktop. Controls may use an adaptive toolbar or bottom action area, but mirror mode must never transform the settings/control interface.
- Do not persist scroll position, speed, font size, mirror preference, countdown state, or any recording state in PostgreSQL, localStorage, cookies, or another client persistence mechanism unless a pre-existing application preference convention is explicitly approved before implementation.

## Complete V1 acceptance criteria

### Authorization and immutable versioning

- [x] An authorized creator sees the current accepted Version at the normal Teleprompter entry point.
- [x] Editing the mutable Draft after acceptance does not change an already-open or newly loaded Teleprompter DTO until a new Version is accepted.
- [x] Re-accepting a new Version makes the normal Content entry point resolve and render that new accepted Version.
- [x] A Content without an accepted Version shows a correct localized accept-first state and never renders Draft text.
- [x] Foreign Workspace, non-member, unauthenticated, and invalid ownership requests remain nondisclosing under the existing Content authorization boundary.
- [x] A missing, mismatched, invalid, deleted, or non-`CREATOR_ACCEPTED` `acceptedVersionId` fails closed, renders no Draft fallback, and produces the defined localized unavailable state for an otherwise authorized request.
- [x] The server DTO contains only safe immutable presentation data and no database access exists in Teleprompter React components.

### Rendering and historical compatibility

- [x] Script block order and text are preserved exactly for the selected accepted Version.
- [x] Every projected Performance Hint remains associated with the correct Script block and stored order.
- [x] Performance Hints are distinguishable from spoken Script through semantics and presentation, not color alone, and can be hidden without changing Script.
- [x] All seven existing Phase 5 Performance Direction variants render with localized type/value labels; no new taxonomy is added.
- [x] Edit Directions are not rendered as spoken content and no V1 Edit Direction behavior is introduced.
- [x] Accepted V1, V2, and V3 documents follow existing read/projection rules without migration, mutation, or loss of Script meaning.
- [x] Creator text remains independent of UI locale and mixed Persian/Latin content remains bidi-safe.

### Controls and browser behavior

- [x] Start/play, pause, resume, and completion behave as specified.
- [x] Manual touch, pointer, scrollbar, and keyboard scrolling work; user scrolling cancels countdown and pauses competing auto-scroll.
- [x] Speed and text-size controls apply bounded, labeled values without resetting content or position.
- [x] Restart returns to the beginning, resets progress, cancels playback/countdown, and respects reduced motion.
- [x] A three-second countdown precedes auto-scroll, is announced, remains cancellable, and does not trap focus.
- [x] Progress accurately reports scroll position from start to end and is accessible without color dependence.
- [x] Performance Hint visibility toggles independently of Script rendering and exposes its state accessibly.
- [x] Mirror mode affects only the reading surface and leaves settings, controls, focus, and ordinary RTL behavior usable.
- [x] Fullscreen works where supported, fails gracefully where unsupported, and remains discoverably escapable.
- [x] Required keyboard shortcuts work without hijacking focused form controls or editable elements.
- [x] Wake Lock is requested, released, reacquired after supported visibility changes, and safely skipped when unsupported/denied.

### Lifecycle and quality

- [x] Countdown timeouts, animation frames, scroll listeners, fullscreen listeners, visibility listeners, and Wake Lock resources are cleaned up on pause, unmount, navigation, and completion.
- [x] There is no runaway timer/animation loop, duplicate listener, stale closure, or post-unmount state update.
- [x] UI state is ephemeral and no Teleprompter preference or RecordingSession persistence is introduced.
- [x] The reading surface is usable at the largest supported text size on phone, tablet, and laptop/desktop without horizontal overflow or inaccessible controls.

### Internationalization and accessibility

- [x] English/LTR and Persian/RTL component/application coverage passes with correct `lang`, `dir`, logical layout, localized empty/unavailable guidance, and localized control labels.
- [x] Mixed-direction creator text and Persian Performance Note content remain readable and are not reversed or translated.
- [x] Keyboard navigation, visible focus, semantic control names, status feedback, countdown cancellation, fullscreen exit, and reduced-motion behavior are verified.
- [x] Hint distinction remains understandable to users who cannot perceive color.

## Test layer

- Unit tests cover the immutable accepted-Version projection, V1/V2/V3 compatibility, Script/hint ordering, safe omission of Edit Directions, progress calculation, bounded speed/text-size state, countdown transitions, keyboard mapping, mirror-state separation, reduced-motion behavior, and cleanup state machine.
- Application/integration tests cover authenticated Workspace membership, Content ownership, current `acceptedVersionId` resolution, Draft-after-acceptance immutability, re-acceptance selecting the new Version, no-accepted-Version state, foreign Workspace nondisclosure, and invalid/missing accepted-Version fail-closed behavior.
- Component tests cover Script-first rendering, hint association/distinction, localized EN/FA `lang`/`dir`, mixed-direction text, all controls, keyboard behavior, focus/status announcements, responsive control availability, mirror mode, fullscreen fallback, and Wake Lock acquisition/release/unsupported behavior.
- Use deterministic browser API seams for `requestAnimationFrame`, timers, fullscreen, `navigator.wakeLock`, `visibilitychange`, reduced-motion media queries, and scroll metrics. Do not depend on real Wake Lock or fullscreen support in CI.
- Add at most one representative Teleprompter Playwright journey if the repository's current E2E standards require a cross-boundary browser journey. It should verify authorized accepted-Version navigation, one playback/control path, and one localized reading state; do not create a feature × locale × viewport E2E matrix.
- Manual QA covers English desktop/mobile, Persian desktop/mobile, mixed-direction creator text, long Scripts, large text sizes, hint visibility, mirror usability, fullscreen exit, reduced motion, and distance readability.

## Explicit V1 exclusions

- Video recording.
- Audio recording.
- Camera capture.
- Microphone capture.
- Speech recognition.
- Voice-following scroll.
- AI performance evaluation.
- Recording takes.
- Remote-control device synchronization.
- Bluetooth-specific integrations.
- Automatic editing.
- Media timeline.
- B-roll playback during prompting.
- Teleprompter analytics.
- `RecordingSession` persistence.
- Draft-backed production prompting.
- New Performance Direction types or Edit Direction editing/playback behavior.

## Dependencies, blockers, and implementation order

### Dependencies

- Existing accepted-Version pointer and acceptance service from Phase 5 Ticket 06.
- Existing Content read service and V1/V2/V3 presentation/projection rules.
- Existing Content detail/editor route, locale routing, `next-intl`, shadcn/ui primitives, and workspace authorization boundary.
- Existing Performance Direction contracts and localized Content direction labels.

### Blockers to raise before implementation

- A conflict between this extension and ADR-003/ADR-004 accepted-Version or document-projection rules.
- Inability to resolve the same-Content accepted pointer through the existing authorized read boundary without falling back to mutable Draft state.
- A requirement for a new persistence model, provider, application shell, or Performance Direction taxonomy.
- Any request to add video/audio/camera/microphone capture, recording takes, remote control, or analytics to this V1 ticket.

### Recommended implementation order

1. Reconfirm the existing authorized Content/version read seam and define the safe Teleprompter DTO, including fail-closed/no-accepted states.
2. Add the locale-aware immersive route and the localized **Open Teleprompter** / accept-first entry behavior without adding persistence.
3. Implement static Script-first rendering, V1/V2/V3 projection, block-local Performance Hints, and hint visibility semantics.
4. Add scroll, progress, restart, bounded speed/text-size state, countdown, and cancellable auto-scroll lifecycle.
5. Add keyboard controls, mirror mode, fullscreen capability/fallback, reduced-motion behavior, and Wake Lock lifecycle.
6. Complete EN/FA, LTR/RTL, mixed-direction, responsive, and accessibility verification using the existing UI primitives and standards.
7. Run unit/application/component tests, the single representative E2E only if warranted, manual QA, and the relevant repository checks; re-open every acceptance checkbox before closing the ticket.

## Answer

Ticket 08 is complete. The authorized Teleprompter route resolves the current immutable accepted Version on every load, projects V1/V2/V3 documents without writes, and provides the approved Script-first controls, lifecycle handling, and EN/FA accessibility behavior. No persistence model or migration was required.

## Comments

- Implemented and validated on 2026-09-08. The Teleprompter reads only the authorized current immutable `CREATOR_ACCEPTED` Version, supports V1/V2/V3 projection and ephemeral browser controls, and adds no persistence model or migration. One unrelated pre-existing stale-tab E2E test remains failing; the representative Teleprompter journey passes.
- Approved post-completion extension recorded on 2026-09-08. No application code, schema, migration, ADR, or implementation work is included in this documentation change.
