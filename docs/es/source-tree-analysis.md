# Vellum — Análisis del árbol de fuentes

---

## Árbol completo anotado

```
vellum/
├── apps/
│   └── desktop/                        # Composition Root — Tauri 2 + Vite/React
│       ├── src/                        # Frontend TS: entry point, hooks Tauri-specific
│       │   ├── main.tsx                # Ensambla @vellum/ui::App con adapters Tauri (parse, export, updater)
│       │   ├── hooks/
│       │   │   ├── use-parse-cslmap.ts # Carga .cslmap vía IPC + file dialog
│       │   │   └── use-export-png.ts   # Adapter: bytes PNG del renderer → comando export_png
│       │   ├── export/                 # Selección legacy vs. tiled export, benchmark runner
│       │   └── window-close-cancel.ts  # Espera cancelación de export antes de cerrar la ventana
│       ├── src-tauri/                  # Backend Rust: comandos IPC, plugins, menú nativo
│       │   ├── src/
│       │   │   ├── main.rs             # Llama a vellum_lib::run()
│       │   │   ├── lib.rs              # Builder Tauri, plugins, menú nativo, updater en background
│       │   │   ├── commands.rs         # #[tauri::command]: parse_cslmap, export_png, begin/append/finish/cancel_export, load_themes, open_export_folder
│       │   │   ├── startup.rs          # Handoff del path .cslmap recibido por asociación de archivos
│       │   │   ├── updater.rs          # get_pending_update; check_for_updates en background
│       │   │   ├── city_data.rs        # Modelo de dominio (espejo Rust de @vellum/core)
│       │   │   ├── errors.rs           # VellumError (Rust)
│       │   │   ├── ipc_contract.rs     # Payloads IPC internos (incl. UpdatePayload)
│       │   │   └── export/             # session.rs (ExportSessionManager), framing.rs, svg_writer.rs, tile_composer.rs
│       │   └── resources/themes/       # 5 temas built-in (.vellumstyle): day, grayscale, classic, transit, grayscale-water
│       └── tests/e2e/smoke.spec.ts     # Playwright — smoke test mínimo (título + body visible)
├── packages/
│   ├── core/                           # @vellum/core — capa de dominio pura, cero dependencias internas
│   │   └── src/
│   │       ├── types/                  # city-data, cartographic-scene, layer, renderer (IRenderer), theme, color-tokens, export-pipeline, export-presentation
│   │       ├── ipc-contract.ts         # IPC_COMMANDS, IPC_EVENTS, VellumError — fuente de verdad del contrato
│   │       ├── testing/city-data-factory.ts  # Barrel de test independiente (@vellum/core/testing)
│   │       └── index.ts                # Barrel público; re-exporta tipos, renderer, theme e IPC
│   ├── parser-cslmap/                  # Adapter: XML .cslmap → CityData (crate Rust propio + adapter TS/napi)
│   │   ├── src/
│   │   │   ├── parser.rs + parser/{builder,events,utils,types}.rs   # Loop de eventos streaming
│   │   │   ├── parser/handlers/{roads,buildings,transit,districts,parks}.rs
│   │   │   ├── parser/terrain/{grid,vectorizer,texture}.rs          # CSV → isolines/contornos, DEM PNG
│   │   │   ├── dlc_fallback.rs         # Fallback por ItemClass desconocido (clasificación por ancho)
│   │   │   └── city_data.rs, types.rs  # Espejo Rust del modelo de dominio
│   │   └── fixtures/                   # minimal-valid, with-transit(-paths-debug), corrupted, unknown-dlc-assets (chicas) + 5 ciudades reales 11-24MB
│   ├── renderer-webgl/                 # @vellum/renderer-webgl — ACTIVO, implementa IRenderer
│   │   └── src/
│   │       ├── geojson/                # CityData → GeoJSON puro (sin import de MapLibre), builders/ config/ types/ utils/
│   │       ├── layers/                 # Un archivo de config de capa MapLibre por capa (terrain, roads, transit, buildings, forests, districts, grid, map-frame, service-icons, watermark, background, basemap)
│   │       ├── managers/               # map-layer / map-navigation / map-source (mutación de capas/fuentes/cámara)
│   │       ├── transit/                # Geometría, ordering y line-graph específicos de tránsito
│   │       ├── export/                 # Pipeline PNG (tiled + legacy) y SVG — ver architecture-desktop.md
│   │       ├── capability-probe.ts     # Mide límites WebGL/memoria/encoder → decide ruta de export
│   │       ├── interactions/           # Hover/click/tooltip
│   │       └── assets/maki-icons/      # Iconografía de servicios
│   ├── theme-engine/                   # @vellum/theme-engine — .vellumstyle → RenderStyleParams
│   │   └── src/
│   │       ├── default-style.ts        # DEFAULT_RENDER_STYLE_PARAMS
│   │       ├── loader.ts               # loadThemes()
│   │       ├── schema-migration.ts     # migrateTheme() — único lugar que castea a VellumStyle
│   │       └── validators/{color,theme}.ts
│   └── ui/                             # @vellum/ui — única capa con React, ~41 archivos fuente
│       └── src/
│           ├── App.tsx                 # Ensambla MapLibreRoot + EmptyState/ProgressBar + overlays + panels
│           ├── components/
│           │   ├── canvas/MapLibreRoot.tsx        # Monta el renderer WebGL activo
│           │   ├── empty-state/                   # DropZone, ContextualHint, GridBackground, Version
│           │   ├── minimap/Minimap.tsx
│           │   ├── overlays/           # ProgressBar, ErrorToast, PartialParseDialog, DlcWarningToast, ThemeWarningToast, UpdateToast, MapTooltip, ExportStatusOverlay
│           │   └── panels/             # FloatingLayerPanel, LayerToggleRow, AdvancedOptionsPanel, IconLegend, ExportDialog, PreferencesPanel
│           ├── hooks/                  # use-keyboard-shortcuts, use-tauri-event, use-themes, use-export-workflow, use-progress-events
│           ├── store/                  # vellum-store.ts (Zustand) + preferences-store.ts (tauri-plugin-store)
│           ├── i18n/                   # i18n-setup.ts + locales/{en,es}.json
│           └── lib/                    # utils.ts (cn), button/dialog/progress/separator/switch.tsx (Radix, estilo shadcn)
└── docs/                               # Esta documentación
```

## Carpetas críticas explicadas

| Carpeta                                  | Por qué importa                                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/ipc-contract.ts`      | Única fuente de verdad del contrato IPC — cualquier cambio requiere sincronía Rust+TS en el mismo commit                            |
| `packages/renderer-webgl/src/geojson/`   | Traduce `CityData` a GeoJSON sin depender de MapLibre — reutilizado también por el pipeline SVG vía `cartographic-scene-builder.ts` |
| `packages/renderer-webgl/src/export/`    | Dos rutas de export (tiled vs. legacy) decididas en runtime por `capability-probe.ts`                                               |
| `apps/desktop/src-tauri/src/commands.rs` | Comandos Tauri de parseo, temas y export expuestos a la UI; el inventario canónico está en `IPC_COMMANDS`                           |
| `apps/desktop/src-tauri/src/startup.rs`  | Conserva el path `.cslmap` entregado por el OS hasta que el frontend puede consumirlo                                               |
| `packages/ui/src/store/vellum-store.ts`  | Único store Zustand — estado de carga, capas, temas, idioma, preferencias, updates                                                  |
| `packages/parser-cslmap/fixtures/`       | Fixtures reales (11-24MB) usados para validar bugs de rendering que fixtures sintéticos no detectan                                 |

## Puntos de entrada

- Frontend: [`apps/desktop/src/main.tsx`](../../apps/desktop/src/main.tsx)
- Rust: [`apps/desktop/src-tauri/src/main.rs`](../../apps/desktop/src-tauri/src/main.rs) → `lib.rs::run()`
- App React: [`packages/ui/src/App.tsx`](../../packages/ui/src/App.tsx)

## Nota sobre `renderer-canvas`

Retirado del repositorio por [ADR-0001](../adr/0001-rendering-ownership.md). Los wrappers de React (`CanvasRoot.tsx`, `CanvasLayer.tsx`, `hooks/useRenderLoop.ts`) ya se habían eliminado antes; el package en sí se elimina ahora, sin importadores de runtime que lo sostuvieran. El único renderer de la aplicación es `renderer-webgl`, y `@vellum/ui` lo alcanza a través de `MapRendererPort` — nunca por import directo.
