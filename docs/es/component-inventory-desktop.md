# Vellum — Inventario de componentes UI

---

## Estado actual

`@vellum/ui` es la única capa con React del monorepo. Todos los componentes listados
abajo están implementados y en uso — no hay placeholders.

## Árbol de componentes actual

`App` bloquea el render hasta que `initI18n()` y las preferencias hidratan; luego
delega la composición visual a `AppSurface` (dentro de un `Suspense`):

```
App
└── AppSurface
    ├── DesktopShell
    │   ├── ShellSidebar → FloatingLayerPanel
    │   └── MapSurface → MapLibreRoot (siempre montado)
    ├── EmptyState / progreso / recuperación / toasts
    ├── IconLegend          — ocultable en modo limpio
    ├── ExportDialog        — si hay ciudad cargada
    ├── PreferencesPanel
    └── ExportStatusOverlay
```

Hooks wireados en `App.tsx`: `useKeyboardShortcuts`, `useTauriEvent` (preferences-open, update-available), `useThemes`, `useExportWorkflow`, más el store global `useVellumStore`.

## Dirección UX planificada

> **Planificado; los nombres de esta sección aún no son nombres de archivos.** La
> [espina de arquitectura incremental](../../vellum-context/_bmad-output/planning-artifacts/architecture/architecture-vellum-2026-09-05/ARCHITECTURE-SPINE.md)
> reemplazará gradualmente la semántica, no los contratos, de esta composición.

`MapAppearanceSidebar` sucederá a `ShellSidebar` y `FloatingLayerPanel`: overview
para tema/capas y un único detalle de capa que reutiliza `AdvancedOptionsPanel`.
`MapViewport` sucederá a la responsabilidad visual de `MapSurface` mediante slots
para minimapa, controles de cámara, leyenda, tarjeta contextual y estado. Los
handlers de `App`, `useVellumStore`, menú nativo y atajos continúan siendo las
rutas de acción compartidas durante toda la migración.

## Componentes por módulo

### `components/canvas/`

| Componente         | Propósito                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `MapLibreRoot.tsx` | Monta el renderer WebGL activo; wirea visibilidad de capas, tema, zoom/pan/bearing y expone captura de preview/snapshot para export |

> El wrapper legacy Canvas 2D (`CanvasRoot.tsx`, `CanvasLayer.tsx`, `hooks/useRenderLoop.ts`) fue eliminado de este módulo — `MapLibreRoot` es su reemplazo directo, sin equivalente Canvas activo en el árbol de componentes.

### `components/empty-state/`

| Componente                      | Propósito                                                      |
| ------------------------------- | -------------------------------------------------------------- |
| `EmptyState.tsx`                | Pantalla inicial sin mapa cargado — drag&drop + `Ctrl/Cmd+O`   |
| `components/DropZone.tsx`       | Superficie visual de drop (borde punteado), sin lógica de drag |
| `components/ContextualHint.tsx` | Párrafo de hint animado, montado solo durante su fase activa   |
| `components/GridBackground.tsx` | Grilla cartográfica sutil de fondo                             |
| `components/Version.tsx`        | Muestra la versión de la app                                   |
| `hooks/useHintCycle.ts`         | Maneja las fases de animación hidden→visible→leaving del hint  |

### `components/minimap/`

| Componente    | Propósito                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `Minimap.tsx` | Vista general con los límites del viewport, click-to-pan, se suscribe a cambios de viewport del mapa principal |

### `components/overlays/`

| Componente                | Propósito                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `ProgressBar.tsx`         | Barra de progreso durante la carga de un archivo                                           |
| `ErrorToast.tsx`          | Notificación persistente para fallos de parseo no recuperables                             |
| `PartialParseDialog.tsx`  | Modal que ofrece render parcial cuando el `.cslmap` tiene errores recuperables por sección |
| `DlcWarningToast.tsx`     | Toast de advertencias de assets DLC/mod desconocidos o datos parciales                     |
| `ThemeWarningToast.tsx`   | Toast listando `.vellumstyle` inválidos descartados al arrancar                            |
| `UpdateToast.tsx`         | Toast de esquina anunciando una versión nueva disponible                                   |
| `MapTooltip.tsx`          | Tooltip contextual sobre features del mapa, con detección de bordes                        |
| `ExportStatusOverlay.tsx` | Progreso/resultado/cancelación/error de un export en curso                                 |

### `components/panels/`

| Componente                 | Propósito                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `FloatingLayerPanel.tsx`   | Panel flotante principal de control de visibilidad de capas, con íconos por capa                                 |
| `LayerToggleRow.tsx`       | Una fila de toggle dentro de `FloatingLayerPanel`                                                                |
| `AdvancedOptionsPanel.tsx` | Filtros avanzados por capa (modos de tránsito, categorías RICO de edificios, opciones de terreno/basemap)        |
| `IconLegend.tsx`           | Leyenda de íconos de servicios, colapsable/expandible (máquina de estados announced/collapsed/expanded)          |
| `ExportDialog.tsx`         | Diálogo de configuración de export — fondo, selección de capas, disponibilidad de contenido, leyenda de tránsito |
| `PreferencesPanel.tsx`     | Diálogo de idioma + toggle de auto-update                                                                        |

## Hooks (`hooks/`)

| Hook                        | Propósito                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `use-keyboard-shortcuts.ts` | Ata todos los atajos globales (abrir archivo, capas 1-7, zoom, fit, modo navegación, rotar, export, modo limpio, leyenda) |
| `use-tauri-event.ts`        | Helper genérico de suscripción a eventos del backend Tauri, con `onSettled`                                               |
| `use-themes.ts`             | Carga todos los `.vellumstyle` una vez al arrancar, puebla el store                                                       |
| `use-export-workflow.ts`    | Orquesta el ciclo de vida completo de export (preview, progreso, cancelación, timeout, warnings/errores)                  |
| `use-progress-events.ts`    | Se suscribe a eventos IPC de progreso de carga                                                                            |

## Estado global (`store/vellum-store.ts`, Zustand)

Un único store. Slices: carga de ciudad (`idle/loading/error` + `loadingError`, `loadRequestId`), advertencias DLC/parciales, visibilidad de capas (`activeLayers`) + opciones avanzadas por capa (filtro de modo de tránsito, filtro/color RICO de edificios, toggles de labels de distrito/áreas de parque, contornos/relieve/hillshade de terreno, grilla de basemap), temas activo/disponibles + dimming de tránsito, estado expandido del panel avanzado, warnings de carga de temas, idioma activo + flag de auto-update, payload de update pendiente.

`store/preferences-store.ts` — módulo separado que envuelve `tauri-plugin-store` (`preferences.json`) para persistir tema/capas/idioma/auto-update, con cola de escritura serializada.

## i18n

- `i18n/i18n-setup.ts` — inicializa i18next + react-i18next, importa los JSON de locale estáticamente (sin fetch en runtime, offline-safe)
- Prioridad de idioma: preferencia persistida → `navigator.language` → fallback `en`
- `i18n/locales/{en,es}.json` — únicas fuentes de las claves de traducción (JSON plano por idioma, sin split por componente)

## Design system (`lib/`)

Primitivas estilo shadcn sobre Radix UI: `button.tsx`, `dialog.tsx`, `progress.tsx`, `separator.tsx`, `switch.tsx`, más `utils.ts` (`cn()` — merge de clases Tailwind).

## Testing

Los tests (`*.test.ts` / `*.test.tsx`) viven bajo `packages/ui/src`, junto a la mayoría
de los componentes, hooks y stores listados arriba.
