# 03: Replace the textarea with the structured Script block editor

**What to build:** Give creators a usable, accessible V2 Script editor that consumes projected legacy V1 Drafts and persisted V2 Drafts, edits stable paragraph blocks, and saves through the existing whole-document Draft protocol.

**Blocked by:** 02 — Deliver V2 Draft persistence and lazy legacy migration.

**Status:** ready-for-agent

- [ ] Replace the plain Script textarea with a purpose-built React editor whose aggregate owns one canonical V2 working document and uses native textareas keyed by stable block ID.
- [ ] Deliver composition-safe split, merge, multiline paste, block add/move/delete, canonical empty-block behavior, and deterministic caret/focus transfer.
- [ ] Preserve serialized autosave, conflict/reload/copy behavior, and acceptance gating for the full local document.
- [ ] Provide Script-first desktop and mobile fundamentals, semantic ordered blocks, keyboard controls, deletion safeguards, and correct EN/FA content-language direction and typography independent of UI locale.
- [ ] Prove browser interaction and accessibility behavior with component tests; add no direction authoring or generation cutover in this ticket.

## Required invariants

- No Lexical, TipTap, ProseMirror, shared `contenteditable`, rich-text marks, or editor-model adapter is introduced.
- Enter and Backspace structural behavior is disabled while IME composition is active.
- Text-containing or direction-owning blocks require explicit deletion confirmation; empty direction-free blocks may delete immediately.

## Test layer

Component tests for editing, composition, focus, keyboard, deletion, autosave UI, and EN/FA semantics; unit/domain tests for operations as needed. No Playwright until hardening.
