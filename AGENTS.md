# AGENTS.md

> Compact onboarding for OpenCode sessions. Not a substitute for `CLAUDE.md` — read that file too.

## Repo overview

**Vellum** — Tauri 2 + React 19 + TypeScript 5.8 desktop app for viewing Cities: Skylines `.cslmap` files. pnpm + Turborepo monorepo.

**Existing instruction files you must read:**

- `/CLAUDE.md` — domain rules, anti-patterns, mandatory renderer filters, full architecture writeup
- `_bmad-output/planning-artifacts/` — PRD, architecture, epics, UX spec
- `_bmad-output/implementation-artifacts/` — sprint status, deferred work, story specs

## Commands

```bash
pnpm install                        # also: pnpm approve-builds if esbuild blocked
pnpm dev                            # Vite + Tauri, opens native window
cd apps/desktop && pnpm dev:vite    # frontend only, no Tauri
pnpm build                          # all packages, topological order
pnpm lint                           # tsc --noEmit all packages + architecture ESLint check
pnpm check:architecture             # same as lint:arch — run after touching cross-package deps
pnpm test                           # all packages via Turborepo
pnpm --filter @vellum/renderer-webgl test  # single package
pnpm --filter @vellum/ui test -- SomeFile.test.tsx  # single test file
pnpm format                         # prettier --write
pnpm format:check                   # prettier --check

# Rust
cargo fmt --all -- --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml  # 60% faster than cargo build

# Fix TS6305 / stale build artifacts
rm -rf .turbo apps/desktop/dist packages/*/dist
find . -name "tsconfig.tsbuildinfo" -delete && pnpm build
```

## Pre-commit hooks (husky)

Runs on every commit — **you must pass these locally**:

1. `pnpm lint` (tsc --noEmit + architecture check)
2. `pnpm format:check`
3. `cargo fmt --all -- --check`
4. `cargo clippy --workspace --all-targets -- -D warnings`

Commit messages must follow Conventional Commits (`feat:`, `fix:`, `refactor:`, etc.) — enforced by commitlint.

## Monorepo rules

**Dependency graph (strictly unidirectional, ESLint-enforced):**
`desktop → {ui, renderer-webgl, renderer-canvas, theme-engine, parser-cslmap, core}` → `ui → {renderer-webgl, renderer-canvas, theme-engine, core}` → all others → `core`

- **Barrel imports only** — `@vellum/core`, not `@vellum/core/src/...`
- `@vellum/core` has zero @vellum/\* dependencies
- `apps/desktop` is the only Composition Root — only package allowed to import everything
- `packages/ui` is the only package using React

## IPC contract

`packages/core/src/ipc-contract.ts` — single source of truth for Rust↔TS boundary.

- `IPC_COMMANDS` map to Rust `#[tauri::command]` names (snake_case)
- `VellumError` is a discriminated union — **never display `reason` to users**, map `type` to i18n key
- Any change to IPC_COMMANDS or VellumError requires a synchronized Rust update in the same commit

## TS/type quirks

- `any` is **prohibited** — use `unknown` + type guard
- `moduleResolution: "bundler"` — no `.js` extensions in imports
- All exported `interface`, `type`, `enum`, `class` need a JSDoc block
- vitest excludes `**/dist/**` because `tsc -b` emits stale `.test.js` artifacts
- Adding a field to `RendererTokens` (`tokens.ts`) breaks every `MOCK_TOKENS` in test files — no factory helper exists yet

## Rust quirks

- `unwrap()` / `expect()` prohibited in production code
- Functions ≤ 20 lines
- `quick-xml` pinned at 0.36 — 0.38 is a breaking API change
- Tauri commands must have `///` doc comments with `# Errors` section
- Cargo profile overrides must be set in **both** `[profile.dev.package.*]` and `[profile.test.package.*]` — test does NOT inherit dev overrides

## Domain invariants (you will break things if you ignore these)

- `LandArray` and `WaterArray` are separate structures — **never merge**
- `icls="Bus Line"` segments are virtual transit connectors — never render as road geometry
- Road classification uses `ItemClass`, not segment name
- `totalWidth = fixed + (scaled × zoomFactor)` — always expose both components
- `SeaLevel` (~40): cells with `y < seaLevel` are water
- Hardcoded theme only (no `.vellumstyle` loading — that's Epic 5, backlog)
- Renderer is MapLibre GL JS (`@vellum/renderer-webgl`); `renderer-canvas` is legacy, kept for reference only

## Testing notes

- Real fixture files at `packages/parser-cslmap/fixtures/` (altavento, aurelia-del-delta)
- Visual rendering bugs need real .cslmap — synthetic fixtures won't catch them
- E2E (Playwright) exists at `apps/desktop/tests/e2e` but **not wired into CI**

## Code Intelligence and LSP

Use LSP as the first option for code navigation and validation whenever it is available.
Do not use text searches as a substitute for semantic LSP operations.

### Before Making Changes

- Use `documentSymbol` to understand the structure of relevant files.
- Use `goToDefinition` or `goToImplementation` to locate the actual implementation.
- Use `findReferences` before changing signatures, exported types, interfaces, or symbol names.
- Use `workspaceSymbol` to locate symbols across the monorepo.
- Use `hover` to verify types, signatures, and inferred types.
- Use `incomingCalls` and `outgoingCalls` when changes affect flows between modules.

### During Implementation

- Respect the project architecture and package boundaries.
- Do not change a public signature without reviewing and updating all consumers.
- Do not add an interface implementation without reviewing existing implementations.
- After every significant change, check diagnostics for the affected files.
- Immediately fix type errors, missing imports, and invalid references introduced by the change.

### During Code Review

- Inspect references for every modified symbol, type, or interface.
- Review callers and callees of affected functions.
- Verify that changes remain compatible with all implementations and consumers.
- Look for stale references, incorrect imports, unreachable code, and type errors.
- Distinguish pre-existing diagnostics from diagnostics introduced by the change.
- Report any new issue detected by LSP, TypeScript, or ESLint as a finding.
- If no issues are found, explicitly state which areas were checked.

### Fallback When LSP Is Unavailable

If the current surface does not expose LSP tools:

- Use `rg` to locate definitions, references, and imports.
- Run the project checks, such as `pnpm lint`, `pnpm test`, and `pnpm check:architecture`.
- Briefly state that semantic LSP validation was unavailable.
- Do not claim that a text search is fully equivalent to `findReferences`.

### Safety Rule

Before renaming a symbol, changing a signature, or modifying an exported type,
first confirm all of its consumers. If the scope cannot be determined with
sufficient confidence, stop and report the uncertainty.
