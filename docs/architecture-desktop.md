# Vellum Desktop — Documento de Arquitectura

> Generado: 2026-08-07 | Escaneo: Deep | Parte: `desktop` | Reemplaza la versión de 2026-04-04 (proyecto en estado scaffolding)

---

## Resumen ejecutivo

`apps/desktop` es el **Composition Root** del monorepo: el único paquete que ensambla `@vellum/ui`, `@vellum/renderer-webgl`, `@vellum/theme-engine`, `@vellum/parser-cslmap` y `@vellum/core` en una aplicación nativa Tauri 2. No contiene lógica de dominio propia — su rol es adaptar el mundo Tauri (comandos IPC, plugins nativos, menú de sistema, updater) a los puertos que `@vellum/ui` espera.

## Estructura

```
apps/desktop/
├── src/                    # Frontend TS — adapters Tauri-specific
│   ├── main.tsx             # Entry point: ensambla App con hooks/adapters concretos
│   ├── hooks/
│   │   ├── use-parse-cslmap.ts  # invoke('parse_cslmap') + file dialog + progreso
│   │   └── use-export-png.ts    # invoke('export_png') con bytes crudos (sin base64)
│   ├── export/               # Selección legacy vs. tiled, ExportCoordinator, benchmark runner
│   └── window-close-cancel.ts   # Espera cancelación de export antes de win.destroy()
└── src-tauri/               # Backend Rust
    ├── src/
    │   ├── main.rs           # trivial, llama a vellum_lib::run()
    │   ├── lib.rs             # Builder Tauri: plugins, menú nativo, updater en background, cleanup de sesiones
    │   ├── commands.rs        # Todos los #[tauri::command]
    │   ├── updater.rs         # check_for_updates (background) + get_pending_update
    │   ├── city_data.rs, errors.rs, ipc_contract.rs   # Espejo Rust del dominio/IPC
    │   └── export/            # session.rs, framing.rs, svg_writer.rs, tile_composer.rs
    └── resources/themes/      # 5 .vellumstyle built-in
```

## Entry points

- **Frontend**: `src/main.tsx` — renderiza `<AppMetaProvider version><AppShell/></AppMetaProvider>` dentro de `React.StrictMode`. `AppShell` recibe como props los adapters concretos: `useParseCslmap`, `useExportPng`, `ExportCoordinator` (decide ruta legacy vs. tiled vía `probeCapabilities()`), `SvgExporter` (Web Worker dedicado + `TauriSvgExportSink`), y en dev expone `window.__vellumRasterBenchmark`.
- **Rust**: `main.rs` → `vellum_lib::run()` en `lib.rs`.

## Comandos Tauri (`#[tauri::command]`)

| Comando                                                                    | Archivo       | Propósito                                                                                |
| -------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `parse_cslmap`                                                             | `commands.rs` | Parsea `.cslmap` en blocking thread, retorna `CityData`                                  |
| `load_themes`                                                              | `commands.rs` | Lee los `.vellumstyle` built-in de `resources/themes/`                                   |
| `export_png`                                                               | `commands.rs` | Persiste bytes PNG ya renderizados a disco                                               |
| `open_export_folder`                                                       | `commands.rs` | Revela el archivo exportado en el explorador del OS                                      |
| `begin_export` / `append_export_chunk` / `finish_export` / `cancel_export` | `commands.rs` | Ciclo de vida completo de una sesión de export tiled transaccional                       |
| `get_pending_update`                                                       | `updater.rs`  | Retorna (y limpia) un payload de update que llegó antes de que la UI montara su listener |

## Plugins Tauri registrados

`tauri-plugin-dialog`, `tauri-plugin-store` (preferencias), `tauri-plugin-opener`, `tauri-plugin-updater` (solo desktop, agregado en `.setup()`).

## Setup de la aplicación (`lib.rs::run()`)

1. Construye `tauri::Builder`, registra los 4 plugins de arriba
2. `.manage(Arc<ExportSessionManager>)` — estado compartido para sesiones de export
3. Registra todos los comandos vía `invoke_handler!()`
4. `.setup()`:
   - Construye el menú nativo (ver abajo)
   - Barre archivos `.part` de export huérfanos en Downloads (limpieza de sesiones interrumpidas)
   - Spawnea `updater::check_for_updates` en background
5. `.on_window_event` / `RunEvent` — invoca `ExportSessionManager::cleanup_all()` al cerrar

## Menú nativo

Parte de `tauri::menu::Menu::default()` (conserva Edit/Window/submenús estándar del OS) y agrega un item **"Preferences…"** (`CmdOrCtrl+,`) — en el submenú de la app en macOS, o en un submenú "Vellum" prepended en otras plataformas. El evento de menú `"preferences"` emite `vellum://open-preferences`, que `@vellum/ui` escucha para abrir `PreferencesPanel`.

## Preferencias

`tauri-plugin-store` persiste `preferences.json`. La escritura vive del lado de `@vellum/ui` (`store/preferences-store.ts`, con cola serializada); `apps/desktop` solo lo lee en `updater.rs` para el flag `autoUpdateEnabled` (default `false`).

## Verificación de actualizaciones

`updater::check_for_updates` corre en background al iniciar, usando `tauri-plugin-updater` contra GitHub Releases. Si hay una versión nueva:

- Guarda el payload en un `OnceLock<Mutex<Option<UpdatePayload>>>` a nivel de proceso
- Emite `vellum://update-available` (versión + URL de release notes)
- Si `autoUpdateEnabled` es `true`, descarga, instala y reinicia sin intervención del usuario

`get_pending_update` cubre el caso donde el evento llega antes de que el frontend termine de montar su listener.

## Comandos de desarrollo

```bash
pnpm dev          # tauri dev
pnpm dev:vite      # solo Vite (puerto 1420, HMR 1421)
pnpm build         # tauri build
pnpm build:vite    # tsc -b && vite build
pnpm test          # vitest run (14 archivos en src/hooks y src/export/**)
pnpm test:e2e      # playwright test
```

## Testing

| Tipo           | Cantidad                           | Notas                                                                                                                                                           |
| -------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest (TS)    | 14 archivos                        | `src/hooks/**`, `src/export/**`                                                                                                                                 |
| `#[test]` Rust | 94 tests                           | Concentrados en `export/session.rs` (42) y `export/tile_composer.rs` (15) — el módulo más complejo del backend                                                  |
| Playwright E2E | 1 spec (`tests/e2e/smoke.spec.ts`) | Conecta al dev server, valida título de página y que `body` sea visible. Predatea la UI de drag&drop/render/export — no cubre el flujo crítico completo todavía |

## Notas de arquitectura

- Ningún archivo de `apps/desktop` contiene lógica de dominio — parsing, clasificación de vías, reconstrucción de tránsito, etc. viven todos en `packages/*`. Esto es intencional: `apps/desktop` debe poder reemplazar cualquier adapter (parser, renderer, export sink) sin tocar el resto.
- El pipeline de export es, con diferencia, la parte más pesada en tests Rust (57 de 94 tests) — refleja que la exportación tiled con streaming binario y composición incremental es la lógica más delicada del backend.
