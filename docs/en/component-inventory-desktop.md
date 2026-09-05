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
    │   ├── DocumentCommandStrip     — loaded map, hidden below 1280 px
    │   └── desktop-shell__body
    │       ├── MapAppearanceSidebar — overview | one layer detail | compact rail
    │       └── MapViewport
    │           ├── MapLibreRoot (always mounted)
    │           ├── CameraControlGroup
    │           ├── Minimap
    │           ├── IconLegend       — on demand, lower left
    │           └── MapTooltip
    ├── EmptyState / progress / recovery / toasts
    ├── ExportDialog         — when a city is loaded
    ├── PreferencesPanel
    └── ExportStatusOverlay
```

`App` wires the keyboard-shortcut hook, Tauri events, theme loading, export
workflow and the global Zustand store. The components receive callbacks and data;
native side effects stay in the desktop adapters or dedicated hooks.

## Shell seams

Two modules carry the desktop shell's structure and are worth reading before
changing any surface:

| Module                   | Responsibility                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell/shell-session.ts` | Local reducer for the ephemeral session: sidebar width, collapse and overview/detail context, Clean view, the single modal slot, and focus restoration. |
| `shell/commands.ts`      | Command registry every invocation surface shares. Each command owns its availability, so the native menu, a shortcut and a button cannot disagree.      |

`MapAppearanceSidebar` succeeded `ShellSidebar` and `FloatingLayerPanel`, and
`MapViewport` took over overlay composition from `MapSurface`. `useVellumStore`
remains the sole owner of cartographic state; the native menu and keyboard
shortcuts remain first-class routes, now expressed as commands.

The pinnable entity card is **not** implemented. The renderer exposes no
keyboard-navigable entity selection, and the architecture spine forbids shipping
an interactive card without one. Hover inspection is unchanged.

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

| Component     | Purpose                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| `Minimap.tsx` | Overview with viewport bounds, click/drag panning, and keyboard equivalence (arrows pan, Enter recentres). |

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

| Component                  | Purpose                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| `AdvancedOptionsPanel.tsx` | Per-layer filters and display options, hosted by `LayerDetailPanel`.      |
| `IconLegend.tsx`           | On-demand map-symbols legend; placed by the viewport's collision manager. |
| `ExportDialog.tsx`         | Export format, area, background and cartographic-element choices.         |
| `PreferencesPanel.tsx`     | Language selector and automatic-update toggle.                            |

### `components/sidebar/`

| Component                   | Purpose                                                                         |
| --------------------------- | ------------------------------------------------------------------------------- |
| `MapAppearanceSidebar.tsx`  | Docked appearance workspace; owns the overview/detail/compact states and focus. |
| `DocumentContextHeader.tsx` | City identity, source-file disclosure and the collapse control.                 |
| `MapAppearanceOverview.tsx` | Map style plus the seven layer rows.                                            |
| `MapStyleSection.tsx`       | Style choice and the Transit-only dimming option.                               |
| `LayerVisibilityRow.tsx`    | One layer: an independent visibility switch and configuration disclosure.       |
| `LayerDetailPanel.tsx`      | One layer's configuration, replacing the sidebar body.                          |

### `components/viewport/`

| Component                | Purpose                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `MapViewport.tsx`        | Owns overlay layout and the single overlay coordinate space; hosts `MapLibreRoot`.     |
| `CameraControlGroup.tsx` | Zoom, fit and — only while rotated — reset north, all through shared commands.         |
| `overlay-collision.tsx`  | Registers measured overlay rects and displaces lower-priority overlays out of the way. |

## Hooks

| Hook                        | Responsibility                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use-keyboard-shortcuts.ts` | Keymap only: file, layer, zoom, fit, bounds, rotation, export, Clean view, legend and Escape. Each key invokes a command; availability lives there. |
| `use-menu-action.ts`        | Translates native menu actions into the same commands.                                                                                              |
| `use-tauri-event.ts`        | Typed subscription helper for native events.                                                                                                        |
| `use-themes.ts`             | Loads `.vellumstyle` themes once at startup.                                                                                                        |
| `use-export-workflow.ts`    | Coordinates preview, progress, cancellation, timeouts and user-facing errors.                                                                       |
| `use-progress-events.ts`    | Subscribes to parse progress events.                                                                                                                |

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
