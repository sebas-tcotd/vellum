# Vellum — UI component inventory

`@vellum/ui` is the only React layer in the monorepo. The inventory below follows
the composition in `App.tsx`, then groups the supporting components by feature.
It is meant to answer a practical question: when a behavior changes, where should
the change live?

## Current state

The UI layer is implemented rather than scaffolded. `App` waits for i18n and
preferences to hydrate, then composes the map, empty state, loading/error
feedback, controls and export flow.

## Current component tree

```text
App
└── AppSurface
    ├── DesktopShell
    │   ├── ShellSidebar → FloatingLayerPanel
    │   └── MapSurface → MapLibreRoot (always mounted)
    ├── EmptyState / progress / recovery / toasts
    ├── IconLegend           — hidden in clean mode
    ├── ExportDialog         — when a city is loaded
    ├── PreferencesPanel
    └── ExportStatusOverlay
```

`App` wires the keyboard-shortcut hook, Tauri events, theme loading, export
workflow and the global Zustand store. The components receive callbacks and data;
native side effects stay in the desktop adapters or dedicated hooks.

## Planned UX direction

> **Planned; the names in this section are not file names yet.** The
> [incremental architecture spine](../../vellum-context/_bmad-output/planning-artifacts/architecture/architecture-vellum-2026-09-05/ARCHITECTURE-SPINE.md)
> evolves this composition's semantics, not its existing contracts.

`MapAppearanceSidebar` will succeed `ShellSidebar` and `FloatingLayerPanel`: an
overview for style and layers plus one layer detail that reuses
`AdvancedOptionsPanel`. `MapViewport` will take on `MapSurface`'s visual
responsibility through slots for the minimap, camera controls, legend,
contextual card and status. `App` handlers, `useVellumStore`, the native menu and
keyboard shortcuts remain the shared action routes throughout the migration.

## Components by module

### `components/canvas/`

| Component          | Purpose                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `MapLibreRoot.tsx` | Mounts the active renderer, forwards layer/theme/camera state, and exposes preview/snapshot capture for export. |

The former `CanvasRoot` and `CanvasLayer` React wrappers are no longer mounted.
The Canvas renderer itself remains as a legacy package, not as an active UI path.

### `components/empty-state/`

| Component            | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `EmptyState.tsx`     | Initial view with drag-and-drop and `Ctrl/Cmd+O`.                                |
| `DropZone.tsx`       | Visual drop surface; drag behavior is kept outside the presentational component. |
| `ContextualHint.tsx` | Short hint shown during its active animation phase.                              |
| `GridBackground.tsx` | Subtle cartographic background.                                                  |
| `Version.tsx`        | Displays the application version.                                                |
| `useHintCycle.ts`    | Controls the hidden → visible → leaving hint phases.                             |

### `components/minimap/`

| Component     | Purpose                                                  |
| ------------- | -------------------------------------------------------- |
| `Minimap.tsx` | Overview with viewport bounds and click-to-pan behavior. |

### `components/overlays/`

| Component                 | Purpose                                                         |
| ------------------------- | --------------------------------------------------------------- |
| `ProgressBar.tsx`         | Loading progress.                                               |
| `ErrorToast.tsx`          | Persistent notification for fatal parse errors.                 |
| `PartialParseDialog.tsx`  | Offers a partial render when some sections are recoverable.     |
| `DlcWarningToast.tsx`     | Explains simplified DLC/mod asset fallbacks.                    |
| `ThemeWarningToast.tsx`   | Lists invalid themes skipped during startup.                    |
| `UpdateToast.tsx`         | Announces an available release.                                 |
| `MapTooltip.tsx`          | Contextual feature tooltip with viewport-edge handling.         |
| `ExportStatusOverlay.tsx` | Progress, completion, cancellation and error states for export. |

### `components/panels/`

| Component                  | Purpose                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `FloatingLayerPanel.tsx`   | Main layer-visibility panel.                                      |
| `LayerToggleRow.tsx`       | One layer row within that panel.                                  |
| `AdvancedOptionsPanel.tsx` | Per-layer filters and display options.                            |
| `IconLegend.tsx`           | Collapsible legend for service icons.                             |
| `ExportDialog.tsx`         | Export format, area, background and cartographic-element choices. |
| `PreferencesPanel.tsx`     | Language selector and automatic-update toggle.                    |

## Hooks

| Hook                        | Responsibility                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `use-keyboard-shortcuts.ts` | Global file, layer, zoom, fit, navigation, rotation, export, clean-mode and legend shortcuts. |
| `use-tauri-event.ts`        | Typed subscription helper for native events.                                                  |
| `use-themes.ts`             | Loads `.vellumstyle` themes once at startup.                                                  |
| `use-export-workflow.ts`    | Coordinates preview, progress, cancellation, timeouts and user-facing errors.                 |
| `use-progress-events.ts`    | Subscribes to parse progress events.                                                          |

## Global state

`vellum-store.ts` is the Zustand store for loading state, partial-data warnings,
layer visibility and advanced options, themes, transit dimming, language,
automatic updates and pending update payloads.

`preferences-store.ts` is a separate persistence adapter around
`tauri-plugin-store`. It serializes writes to `preferences.json` instead of
letting each component know how preferences reach disk.

## i18n and design system

- `i18n-setup.ts` initializes i18next with static English and Spanish JSON
  resources, so the UI remains usable offline.
- Language preference wins over `navigator.language`; the fallback is English.
- `lib/` contains Radix UI primitives styled with Tailwind, including dialog,
  progress, separator, switch and shared class merging.

## Testing

Tests live next to most components, hooks and store modules under
`packages/ui/src`. The important contract is behavioral: components should keep a
small prop surface, while keyboard handling, persistence, Tauri events and export
coordination remain testable in their own modules.
