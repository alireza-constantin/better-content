# 01: Bootstrap the root Next.js application and developer baseline

**What to build:** A runnable Better Content application foundation at the repository root, using the approved Phase 1 tooling baseline without disturbing the existing documentation.

**Blocked by:** None (can start immediately).

**Status:** resolved

## Phase references

Phase 1 §§4, 7–10, 41, 51–52.

## Implementation skills

- `vercel-react-best-practices` for Next.js and React implementation boundaries.

## Acceptance criteria

- [x] The application runs from the repository root with Node.js 24 declared as the development target.
- [x] The project uses npm and commits `package-lock.json`; it does not introduce Bun, pnpm, Yarn, or a nested application directory.
- [x] The project uses a current patched stable Next.js 16.3 release with the App Router, TypeScript, `src/`, Tailwind CSS, ESLint, and the `@/*` alias.
- [x] shadcn/ui is initialized, with only the foundation required for Phase 1.
- [x] The scripts required by the capabilities implemented in this ticket are present and functional: `dev`, `build`, `lint`, and `typecheck`.
- [x] Test, E2E, and database scripts are added only by the tickets that introduce those capabilities; no placeholder scripts that do not perform real work are created.
- [x] No future-domain modules, product features, or placeholder implementations are introduced.

## Verification

- Run the root application locally.
- Run the available lint, typecheck, and build commands.
- Review the diff to confirm existing documentation and unrelated working-tree changes remain intact.

## Answer

Completed the root Next.js application baseline with Node.js 24.19.0, npm, a committed package lock, Next.js 16.3.2, TypeScript, Tailwind CSS, ESLint, and initialized shadcn/ui foundation. The functional `dev`, `build`, `lint`, and `typecheck` scripts were added; no test, E2E, or database scripts were created.

Verified with `npm run lint`, `npm run typecheck`, `npm run build`, and a local development-server request returning HTTP 200 with the expected page content.
