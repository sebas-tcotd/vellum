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
    │   ├── DocumentCommandStrip     — mapa cargado, oculto bajo 1280 px
    │   └── desktop-shell__body
    │       ├── MapAppearanceSidebar — overview | un detalle de capa | riel compacto
    │       └── MapViewport
    │           ├── MapLibreRoot (siempre montado)
    │           ├── CameraControlGroup
    │           ├── Minimap
    │           ├── IconLegend       — bajo demanda, abajo-izquierda
    │           └── MapTooltip
    ├── EmptyState / progreso / recuperación / toasts
    ├── ExportDialog        — si hay ciudad cargada
    ├── PreferencesPanel
    └── ExportStatusOverlay
```

Hooks wireados en `App.tsx`: `useKeyboardShortcuts`, `useTauriEvent` (preferences-open, update-available), `useThemes`, `useExportWorkflow`, más el store global `useVellumStore`.

## Costuras del shell

Dos módulos sostienen la estructura del shell de escritorio y conviene leerlos
antes de tocar cualquier superficie:

| Módulo                   | Responsabilidad                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell/shell-session.ts` | Reducer local de la sesión efímera: ancho, colapso y contexto overview/detalle del sidebar, Clean view, el único slot modal y la restauración de foco.          |
| `shell/commands.ts`      | Registro de comandos que comparten todas las superficies. Cada comando define su propia disponibilidad, así que menú nativo, atajo y botón no pueden discrepar. |

`MapAppearanceSidebar` sucedió a `ShellSidebar` y `FloatingLayerPanel`, y
`MapViewport` asumió la composición de overlays que tenía `MapSurface`.
`useVellumStore` sigue siendo el único dueño del estado cartográfico; el menú
nativo y los atajos siguen siendo rutas de primera clase, ahora expresadas como
comandos.

La tarjeta de entidad fijable **no** está implementada. El renderer no expone
una selección de entidades navegable por teclado, y la espina de arquitectura
prohíbe publicar una tarjeta interactiva sin ella. La inspección por hover no
cambió.

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

| Componente    | Propósito                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Minimap.tsx` | Vista general con los límites del viewport, click/arrastre para recentrar y equivalencia de teclado (flechas desplazan, Enter recentra) |

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

| Componente                 | Propósito                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `AdvancedOptionsPanel.tsx` | Filtros avanzados por capa (modos de tránsito, zonas RICO de edificios, opciones de terreno/basemap); lo hospeda `LayerDetailPanel` |
| `IconLegend.tsx`           | Leyenda de símbolos del mapa, bajo demanda; la coloca el gestor de colisiones del viewport                                          |
| `ExportDialog.tsx`         | Diálogo de configuración de export — fondo, selección de capas, disponibilidad de contenido, leyenda de tránsito                    |
| `PreferencesPanel.tsx`     | Diálogo de idioma + toggle de auto-update                                                                                           |

### `components/sidebar/`

| Componente                  | Propósito                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `MapAppearanceSidebar.tsx`  | Workspace de apariencia acoplado; dueño de los estados overview/detalle/compacto y del foco |
| `DocumentContextHeader.tsx` | Identidad de la ciudad, disclosure del archivo de origen y control de colapso               |
| `MapAppearanceOverview.tsx` | Estilo de mapa y las siete filas de capas                                                   |
| `MapStyleSection.tsx`       | Elección de estilo y la opción de atenuado exclusiva de Tránsito                            |
| `LayerVisibilityRow.tsx`    | Una capa: switch de visibilidad y disclosure de configuración, independientes entre sí      |
| `LayerDetailPanel.tsx`      | La configuración de una capa, reemplazando el cuerpo del sidebar                            |

### `components/viewport/`

| Componente               | Propósito                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `MapViewport.tsx`        | Dueño del layout de overlays y del único espacio de coordenadas; hospeda `MapLibreRoot`          |
| `CameraControlGroup.tsx` | Zoom, ajustar y —solo con el mapa rotado— restablecer el norte, siempre vía comandos compartidos |
| `overlay-collision.tsx`  | Registra rects medidos de cada overlay y desplaza a los de menor prioridad fuera del camino      |

## Hooks (`hooks/`)

| Hook                        | Propósito                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use-keyboard-shortcuts.ts` | Solo keymap: abrir archivo, capas 1-7, zoom, fit, límites, rotar, export, Clean view, leyenda y Escape. Cada tecla invoca un comando; la disponibilidad vive allí |
| `use-menu-action.ts`        | Traduce las acciones del menú nativo a esos mismos comandos                                                                                                       |
| `use-tauri-event.ts`        | Helper genérico de suscripción a eventos del backend Tauri, con `onSettled`                                                                                       |
| `use-themes.ts`             | Carga todos los `.vellumstyle` una vez al arrancar, puebla el store                                                                                               |
| `use-export-workflow.ts`    | Orquesta el ciclo de vida completo de export (preview, progreso, cancelación, timeout, warnings/errores)                                                          |
| `use-progress-events.ts`    | Se suscribe a eventos IPC de progreso de carga                                                                                                                    |

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
