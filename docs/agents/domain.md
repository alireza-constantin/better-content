# Domain Docs

How the engineering skills should consume Better Content's established domain documentation when exploring the codebase.

## Before exploring, read these in authority order

1. **`docs/PRD.md`** — product requirements and scope.
2. **`docs/ARCHITECTURE.md`** — technical architecture.
3. **`docs/adr/`** — accepted architectural decisions relevant to the area of work.
4. **`docs/phases/`** — approved implementation-phase specifications relevant to the work.
5. **`AGENTS.md`** — engineering and agent rules.

This is a single-context repository.

## Supplementary domain-modeling documentation

If a Matt Pocock skill later creates a root `CONTEXT.md` for a narrowly defined domain-modeling purpose, treat it as supplementary documentation only.

It must not override the PRD, Architecture, accepted ADRs, or approved phase specifications.

## Flag documentation conflicts

If documentation conflicts or output would contradict an accepted ADR, surface the conflict explicitly rather than silently choosing an interpretation.

Follow the authority order above and request a Product Architect / Technical Lead decision when the conflict materially affects implementation.
