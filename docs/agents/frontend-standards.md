# Frontend Engineering Standards

These standards apply to user-facing frontend implementation in Better Content.

They supplement the PRD, Architecture, Accepted ADRs, phase specifications,
and AGENTS.md. They do not override architectural decisions.

## 1. Design System

Use shadcn/ui primitives when an appropriate primitive exists.

Prefer composing product-specific components from shadcn primitives instead
of creating parallel custom primitives.

Examples include:

- Button
- Input
- Textarea
- Select
- Checkbox
- Radio Group
- Form primitives
- Card
- Alert
- Badge
- Dialog
- Sheet
- Tooltip
- Tabs
- Separator

Do not install or add shadcn components that are not needed by the current
approved scope.

Product/domain components remain Better Content components. They should
compose design-system primitives rather than attempting to make every product
component itself a generic primitive.

## 2. Forms

Use React Hook Form for non-trivial structured forms.

Use Zod through `@hookform/resolvers/zod` for browser-side form validation
where appropriate.

The server/domain validation boundary remains authoritative.

Expected flow:

React Hook Form
→ client-side UX validation
→ server action/application boundary
→ canonical normalization
→ authoritative domain validation
→ application service
→ persistence

Do not duplicate business invariants or authoritative readiness rules in
client components.

Simple one-field or trivial forms do not require React Hook Form merely for
consistency.

## 3. Component Boundaries

Prefer cohesive components based on domain responsibility or meaningful
behavior.

Avoid monolithic components containing unrelated:

- data loading
- form orchestration
- complex interaction state
- multiple domain sections
- reusable controls
- mutation/error handling

Split large product surfaces into logical domain sections and reusable
behavioral components.

Do not split components merely to reduce line count.

Avoid trivial one-field wrapper components that provide no meaningful
abstraction.

## 4. Hooks

Extract hooks when they encapsulate meaningful reusable client behavior or
make ownership of complex browser state clearer.

Good examples:

- unsaved-change handling
- reusable keyboard interaction
- reusable responsive/client behavior

Do not wrap React or library hooks in custom hooks without a concrete
abstraction benefit.

## 5. Server and Client Components

Prefer Server Components for:

- authorization boundaries
- data loading
- initial DTO retrieval
- non-interactive rendering

Use Client Components only where browser state or interaction requires them.

Keep client boundaries as small as practical.

Do not move entire pages to the client merely because one section is
interactive.

## 6. UI Quality

User-facing UI must be intentionally designed rather than assembled as a
collection of default controls.

Every feature should have:

- clear visual hierarchy
- consistent spacing
- appropriate typography
- restrained layout
- clear primary actions
- useful empty states
- loading/error/conflict states where applicable
- responsive behavior
- mobile usability
- EN/FA support
- correct LTR/RTL behavior

Avoid:

- arbitrary decorative complexity
- fake metrics
- excessive cards
- unnecessary gradients/effects
- generic dashboard aesthetics where the product surface is an editor or tool
- placeholder future features

## 7. Accessibility

Accessibility is part of implementation, not deferred hardening.

Verify:

- semantic controls
- labels
- field descriptions
- field-associated errors
- keyboard operation
- visible focus
- disabled states
- accessible names for icon-only controls
- heading hierarchy
- status/error announcements where appropriate
- sufficient responsive touch targets

## 8. Internationalization

All visible user-facing strings must use the existing localization system.

English must work in LTR.

Persian must work in RTL.

Use logical-direction CSS.

User-created mixed English/Persian text must not be transformed or manually
reversed based on UI locale.

UI locale and creator content language are separate concepts.

## 9. Installed Skills

For substantial frontend implementation, agents must actively use the relevant
installed frontend skills during implementation and review rather than merely
listing them in a completion report.

Current relevant skills include, where installed:

- frontend-design
- vercel-react-best-practices
- web-design-guidelines
- taste-skill

Use the exact installed skill name if it differs.

Skill guidance is advisory to implementation technique. Repository
architecture, ADRs, phase specifications, and acceptance criteria remain
authoritative.

For visually important product surfaces, use `frontend-design` and `taste`
during design/implementation review.

For React/Next.js implementation, use `vercel-react-best-practices`.

For accessibility, responsive behavior, and interface review, use
`web-design-guidelines`.

## 10. Definition of Done

Frontend work is not complete solely because it renders.

Relevant work must pass:

- formatting
- lint
- typecheck
- tests
- build
- accessibility review
- responsive review
- EN/FA review
- LTR/RTL review

For a substantial user-facing feature, the completion report must state which
frontend/design skills were actually used and summarize material findings and
fixes.