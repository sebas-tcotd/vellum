# Vellum — Source tree analysis

This is a map of the directories that matter when tracing a feature through the
repository. It is intentionally annotated: the point is not to list every file,
but to show where a responsibility belongs.

## Annotated tree

```text
vellum/
├── apps/
│   └── desktop/                         # Composition root — Tauri 2 + Vite/React
│       ├── src/                         # Tauri-specific frontend adapters
│       │   ├── main.tsx                 # Assembles @vellum/ui with native adapters
│       │   ├── hooks/                   # Parsing and export IPC adapters
│       │   ├── export/                  # Legacy/tiled selection and coordination
│       │   └── window-close-cancel.ts   # Waits for export cancellation on close
│       ├── src-tauri/                   # Rust commands, plugins and native menu
│       │   ├── src/
│       │   │   ├── main.rs              # Calls vellum_lib::run()
│       │   │   ├── lib.rs               # Tauri builder and application lifecycle
│       │   │   ├── commands.rs          # Tauri commands exposed to the UI
│       │   │   ├── startup.rs           # File-association startup path handoff
│       │   │   ├── updater.rs           # Background update check and recovery
│       │   │   ├── city_data.rs         # Rust mirror of the domain model
│       │   │   ├── errors.rs            # Native VellumError definitions
│       │   │   ├── ipc_contract.rs      # Native IPC payloads
│       │   │   └── export/              # Sessions, framing, SVG and tile composition
│       │   └── resources/themes/        # Built-in .vellumstyle themes
│       └── tests/e2e/                   # Playwright smoke test
├── packages/
│   ├── core/                            # @vellum/core — pure domain layer
│   │   └── src/
│   │       ├── types/                   # CityData, renderer, theme and export types
│   │       ├── ipc-contract.ts          # Shared commands, events and errors
│   │       ├── testing/                 # Test-only city-data factory
│   │       └── index.ts                 # Public barrel
│   ├── parser-cslmap/                   # XML .cslmap → CityData adapter
│   │   ├── src/                         # Streaming parser and element handlers
│   │   └── fixtures/                    # Real cities plus edge-case fixtures
│   ├── renderer-webgl/                  # Active MapLibre implementation
│   │   └── src/
│   │       ├── geojson/                 # CityData → renderer-independent GeoJSON
│   │       ├── layers/                  # MapLibre layer definitions
│   │       ├── managers/                # Sources, layers and camera state
│   │       ├── transit/                 # Transit geometry and line ordering
│   │       ├── export/                  # PNG and SVG pipelines
│   │       ├── interactions/            # Hover, click and tooltip behavior
│   │       └── assets/maki-icons/       # Service icon catalogue
│   ├── renderer-canvas/                 # Legacy Canvas 2D implementation
│   │   └── src/                         # Worker-based rendering and geometry
│   ├── theme-engine/                   # .vellumstyle → RenderStyleParams
│   │   └── src/                         # Defaults, migration, loader and validators
│   └── ui/                              # @vellum/ui — the only React package
│       └── src/
│           ├── App.tsx                  # App shell and feature composition
│           ├── components/              # Map, panels, overlays and empty state
│           ├── hooks/                   # Keyboard, themes, export and Tauri events
│           ├── store/                   # Zustand state and persisted preferences
│           ├── i18n/                    # English and Spanish locale data
│           └── lib/                     # Radix/Tailwind UI primitives
└── docs/                                # Public technical documentation
```

## Critical folders

| Location                                 | Why it matters                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/core/src/ipc-contract.ts`      | Shared source of truth for the IPC contract; Rust and TypeScript must stay synchronized.                                 |
| `packages/renderer-webgl/src/geojson/`   | Converts domain data to GeoJSON without coupling the builders to MapLibre; the SVG pipeline reuses the same scene logic. |
| `packages/renderer-webgl/src/export/`    | Contains the legacy and tiled export paths selected by the capability probe.                                             |
| `apps/desktop/src-tauri/src/commands.rs` | Native command boundary exposed to the frontend.                                                                         |
| `apps/desktop/src-tauri/src/startup.rs`  | Holds a `.cslmap` path received from the OS until the frontend is ready to parse it.                                     |
| `packages/ui/src/store/vellum-store.ts`  | Holds loading, layer, theme, language and update state.                                                                  |
| `packages/parser-cslmap/fixtures/`       | Real files expose rendering bugs that synthetic fixtures often hide.                                                     |

## Entry points

- Frontend: [`apps/desktop/src/main.tsx`](../../apps/desktop/src/main.tsx)
- Rust: [`apps/desktop/src-tauri/src/main.rs`](../../apps/desktop/src-tauri/src/main.rs)
  → `lib.rs::run()`
- React app: [`packages/ui/src/App.tsx`](../../packages/ui/src/App.tsx)

## The legacy Canvas renderer

The active application mounts `MapLibreRoot`, not the old Canvas React wrappers.
`@vellum/renderer-canvas` remains a tested reference and implements the same
renderer port, which makes the historical performance trade-off visible without
making the legacy path part of the current runtime.
