# 04: Deliver localized email/password authentication

**What to build:** A user can sign up, sign in, retain an authenticated session, and sign out through accessible English and Persian Better Auth screens.

**Blocked by:** 02: Establish localized EN/FA application routing and base UI; 03: Establish persistence and application-boundary foundations.

**Status:** resolved

## Phase references

Phase 1 §§20, 23–24, 35, 39, 48–50.

## Implementation skills

- `frontend-design` for authentication screens and form states.
- `vercel-react-best-practices` for client interaction and server data-flow boundaries.

## Acceptance criteria

- [x] Better Auth uses the stable Drizzle/PostgreSQL adapter with email-and-password authentication only.
- [x] Localized sign-up accepts name, email, and password; localized sign-in accepts email and password.
- [x] Successful authentication creates and preserves a real authenticated session; sign-out ends it.
- [x] Forms have associated labels, server-authoritative validation, disabled/submitting states, useful localized errors, keyboard accessibility, responsive layout, and RTL support.
- [x] Raw Better Auth or database errors are not exposed to users.
- [x] No OAuth, magic-link, passkey, two-factor, password-reset, or unapproved provider UI is introduced.

## Verification

- Add and run automated coverage for successful and failing sign-up/sign-in paths and sign-out session termination.
- Verify both locale versions of the forms with keyboard interaction and RTL layout.
- Confirm session-sensitive behavior is validated by the server rather than client state alone.
