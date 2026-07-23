# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Vellum** is a native desktop app (Tauri 2 + React 19 + TypeScript) for viewing `.cslmap` files exported from Cities: Skylines. Organized as a pnpm + Turborepo monorepo. Full planning artifacts live in `_bmad-output/` and `_bmad-output/project-context.md` is the canonical AI rules document — read it before implementing anything non-trivial.

## Commands

```bash
# Install
pnpm install                              # also: pnpm approve-builds if esbuild is blocked

# Development
pnpm dev                                  # Vite + Tauri (opens native window)
cd apps/desktop && pnpm dev:vite          # frontend only, no Tauri process

# Build / Lint
pnpm build                                # all packages, topological order
pnpm lint                                 # tsc --noEmit across all packages
pnpm check:architecture                   # enforce cross-package import rules (run after touching deps)
pnpm format                               # prettier --write

# Tests
pnpm test                                 # all packages via Turborepo
pnpm --filter @vellum/renderer-canvas test   # single package
cd packages/renderer-canvas && pnpm test  # same, from package dir

# Rust
cargo fmt --all -- --check
cargo clippy --workspace -- -D warnings
cargo test --workspace

# Clean stale TS build artifacts (fixes TS6305 and similar)
rm -rf .turbo apps/desktop/dist packages/*/dist
find . -name "tsconfig.tsbuildinfo" -delete && pnpm build
```

Commits must follow Conventional Commits (`feat:`, `fix:`, `refactor:`, etc.) — enforced by commitlint + husky.

## Architecture

### Monorepo structure

```
apps/
  desktop/          ← Tauri shell + Vite/React (Composition Root — only place that assembles everything)
    src/            ← React app: hooks, components, main.tsx
    src-tauri/      ← Rust backend: Tauri commands, IPC, file I/O
packages/
  core/             ← Domain types + IPC contract. Zero dependencies on other @vellum/* packages.
  parser-cslmap/    ← Adapter: .cslmap XML → CityData (Rust via Tauri IPC)
  renderer-canvas/  ← Adapter: CityData → Canvas 2D. Rendering runs in a Web Worker.
  theme-engine/     ← .vellumstyle → RenderStyleParams (design tokens)
  ui/               ← Shared React components. Only package that uses React.
```

**Dependency graph (strictly unidirectional):**
`desktop → {ui, renderer-canvas, theme-engine, parser-cslmap, core}` / `ui → {renderer-canvas, theme-engine, core}` / `renderer-canvas → {theme-engine, core}` / `theme-engine → core` / `parser-cslmap → core`

### Import rules (ESLint-enforced)

- Import from barrel only: `@vellum/core`, `@vellum/ui`, etc. Never from `@vellum/core/src/...`, `dist/`, or relative paths crossing packages.
- `@vellum/core` must have zero internal dependencies — it is the pure entity layer.
- `apps/desktop` is the only Composition Root; it's the only package allowed to import all others.

### IPC contract

`packages/core/src/ipc-contract.ts` is the single source of truth. It defines:

- `IPC_COMMANDS` — maps to Rust `#[tauri::command]` snake_case names. **Any change requires a synchronized Rust update in the same commit.**
- `IPC_EVENTS` — Tauri events from Rust (`vellum://progress`, `vellum://parse-warnings`, `vellum://update-available`).
- `VellumError` — discriminated union mirroring the Rust enum exactly. The UI maps `type` to i18n keys; **never display the raw `reason` string to users.**

### Renderer architecture

`CanvasRenderer` offloads all painting to a Web Worker (`renderer-worker.ts`) via `OffscreenCanvas`. The main thread registers 7 named layers in z-order: `terrain`, `water`, `roads`, `transit`, `buildings`, `forests`, `districts`. The worker buffers a pending render until all 7 layers are registered. Each layer is a standalone file under `packages/renderer-canvas/src/layers/`.

CSS custom properties on `:root` are read once at render time via `readTokensFromDOM()`. Theme changes require re-reading tokens and re-rendering — there is no live CSS cascade inside the worker.

### Domain model & coordinate system

- Map extent: ±8640 units in X and Z (17280×17280 total). Y = elevation.
- Canvas projection: `canvasX = (worldX - minX) / totalX * width` / `canvasY = (worldZ - minZ) / totalZ * height`. Z (north-south) maps to canvas Y (top-bottom).
- `SeaLevel` (~40): cells with `y < seaLevel` are water.
- `LandArray` and `WaterArray` are **separate structures** — never merge them into a single heightmap. This is a domain invariant.
- `CityData` is immutable once built — the parser produces it, the renderer consumes it without mutating.
- Transit routes in `.cslmap` are **pre-calculated by the game** — no pathfinding needed in Vellum, just read `PathUnit → PathSegment → Segment IDs` and draw.

### Mandatory filters

**Road segments** — exclude by `ItemClass`: `Landscaping Canal`, `Landscaping Flood Wall`, `Bus Line` (virtual connectors used only for transit routing, never rendered as road geometry).

**Buildings** — exclude: `Beautification Item`, `Airplane Path`, `Ship Path`, `Earthquake Sensor`, `Firewatch`, `Radio`, `Tsunami Buoy`; also `Water Facility` for point intakes/outlets. Filter by `ItemClass`, not by name.

**Road classification** — use `itemClass` (`icls`) as the source of truth, not segment name. `classifyRoadSegment` uses `ITEM_CLASS_TIER` lookup. Unrecognized classes fall back to width-based classification.

### Road/line width model

```
totalWidth = fixed + (scaled × zoomFactor)
```

Always expose both `fixed` and `scaled` components from `RenderStyleParams`. Never expose a single pre-calculated value.

## Critical Rules

### TypeScript

- `any` is **prohibited** — `@typescript-eslint/no-explicit-any: error`. Use `unknown` + type guard.
- `strict`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes` are all on.
- All exported `interface`, `type`, `enum`, and `class` require a JSDoc block (`/** */`).
- `moduleResolution: "bundler"` — no `.js` extensions in TS imports.

### Rust

- `unwrap()` and `expect()` are **prohibited in production** — all errors are `Result<T, VellumError>`.
- All Tauri commands (`#[tauri::command]`) require `///` doc comments with `# Errors` section listing possible `VellumError` variants.
- Functions ≤ 20 lines. No `#[allow(unused)]` without an explanatory comment.
- `quick-xml` stays at 0.36 — upgrading to 0.38 is a breaking API change; see `deferred-work.md`.

### Anti-patterns to avoid

- Showing `error.reason` from `VellumError` to the user — map `type` to i18n key instead.
- Hardcoding colors, widths, or styles in the renderer — everything comes from `RenderStyleParams`.
- Running parsing, rendering, or export on the main React/Rust thread.
- Unifying `LandArray` and `WaterArray` into a heightmap.
- Rendering segments with `icls="Bus Line"` as road geometry.
- Importing from internal package paths (`@vellum/core/src/...`).

## Testing

**When you add a field to `RendererTokens`** (in `tokens.ts`), every `MOCK_TOKENS` in all existing test files breaks at typecheck. Update all of them in the same PR — there is no factory helper yet.

Real `.cslmap` test files are in `packages/parser-cslmap/fixtures` (13 MB `altavento.cslmap` and 10 MB `aurelia-del-delta.cslmap`). Visual rendering bugs **cannot be caught by unit tests with synthetic fixtures** — always validate against a real file in the app.

Vitest config is per-package (`vitest.config.ts`), aggregated in `vitest.workspace.ts` at the root. Base config is `vitest.config.base.ts`.

## Project Status

See `_bmad-output/implementation-artifacts/sprint-status.yaml` for current story status and `_bmad-output/implementation-artifacts/deferred-work.md` for known deferred issues (pre-existing patterns, not bugs to fix now).

If you can't find `_bmad-output` folder, try doing `../vellum-context/_bmad-output/`.

Full planning docs: `_bmad-output/planning-artifacts/` (PRD, architecture, epics, UX spec). Story files: `_bmad-output/implementation-artifacts/`.

Usar operaciones LSP (goToDefinition, findReferences, etc.) para navegación de código.
Solo usar grep para búsquedas de patrones de texto o strings.
