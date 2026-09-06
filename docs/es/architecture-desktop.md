# Vellum Desktop — Arquitectura de escritorio

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
    │   ├── startup.rs         # Captura un path .cslmap entregado por el OS
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
| `get_startup_file_path`                                                    | `startup.rs`  | Retorna y limpia un path `.cslmap` recibido por asociación de archivos del OS            |
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

En Windows, la asociación de archivos puede abrir Vellum con un path `.cslmap`. El
módulo `startup` conserva ese path hasta el primer montaje del frontend; `main.tsx`
invoca `get_startup_file_path` y lo envía por el mismo flujo de parseo que usa el
diálogo de apertura.

## Comandos de desarrollo

```bash
pnpm dev          # tauri dev
pnpm dev:vite      # solo Vite (puerto 1420, HMR 1421)
pnpm build         # tauri build
pnpm build:vite    # tsc -b && vite build
pnpm test          # todos los tests TypeScript vía Turborepo/Vitest
pnpm test:e2e      # playwright test
```

## Testing

| Tipo           | Cobertura                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Vitest (TS)    | Tests unitarios de adapters Tauri, hooks y coordinación del export.                                                     |
| `#[test]` Rust | Parser, sesiones de export, framing y composición tiled.                                                                |
| Playwright E2E | `tests/e2e/smoke.spec.ts`: smoke test de arranque y visibilidad; todavía no cubre drag&drop → render → export completo. |

## Notas de arquitectura

- Ningún archivo de `apps/desktop` contiene lógica de dominio — parsing, clasificación de vías, reconstrucción de tránsito, etc. viven todos en `packages/*`. Esto es intencional: `apps/desktop` debe poder reemplazar cualquier adapter (parser, renderer, export sink) sin tocar el resto.
- El pipeline de export concentra una parte importante de la cobertura Rust porque la
  exportación tiled con streaming binario y composición incremental es la lógica más
  delicada del backend.

## Shell de escritorio map-first

La evolución del shell que define la espina
[Vellum Desktop UX Incremental](../../vellum-context/_bmad-output/planning-artifacts/architecture/architecture-vellum-2026-09-05/ARCHITECTURE-SPINE.md)
está implementada. El cambio se quedó dentro de `@vellum/ui`: `apps/desktop`
sigue siendo el composition root, no recibió comandos Tauri nuevos, y los
contratos de parseo, mapa, exportación, menú nativo y preferencias no cambiaron.

Cómo quedó el shell:

- **`ShellSession`** posee la sesión efímera — ancho, colapso y contexto
  overview/detalle del sidebar, Clean view, un único slot modal, restauración de
  foco. Es un reducer local, no un segundo store global. `useVellumStore` sigue
  siendo el único dueño del estado cartográfico.
- **`DesktopCommandAdapter`** es la ruta única de toda acción con más de una
  superficie de invocación. Menú nativo, atajos y botones del shell emiten el
  mismo comando y leen la misma disponibilidad.
- **`MapAppearanceSidebar`** reemplazó a `ShellSidebar` y `FloatingLayerPanel`.
  Visibilidad y disclosure de configuración son controles separados; la
  exportación dejó de ser asunto de apariencia y vive en la ruta de documento.
- **`MapViewport`** posee la composición de overlays en un solo espacio de
  coordenadas, con un gestor de colisiones que trabaja sobre rects medidos.
  `MapLibreRoot` conserva renderizado, cámara y suscripciones, y publica solo un
  puerto estrecho para los overlays que necesitan orientarse o navegar.
- **El sidebar flota sobre un mapa a sangre completa**, translúcido, para que el
  paneo siga siendo legible por debajo — el tratamiento que la propia HIG de
  Apple describe para sidebars en la capa Liquid Glass. En macOS además va
  separado de los bordes de la ventana y redondeado, con el mapa continuando a
  su alrededor; las plataformas sin un efecto de compositor confiable lo
  mantienen al ras y opaco, con el mismo marcado y solo distintos valores de
  token. El área que cubre se mide del elemento renderizado, así esos insets de
  plataforma se contemplan sin que ningún componente sepa en cuál está. No hay banda de chrome sobre el mapa:
  Abrir y Exportar son un grupo flotante en su esquina superior derecha. El
  viewport le indica al renderer cuánto lienzo cubre el sidebar, así el encuadre
  de la ciudad nunca deja parte de ella debajo.
- **Abrir un mapa es transaccional.** Una carga ya no descarta el documento
  actual; un reemplazo cancelado o fallido deja intactos el mapa, la cámara y el
  foco anteriores.

Dos cosas faltan a propósito. La tarjeta de entidad fijable no se publica: el
renderer no expone selección de entidades navegable por teclado y la espina
prohíbe una tarjeta interactiva sin ella — el hover no cambió. El ancho del
sidebar es solo de sesión; persistirlo entre aperturas sigue diferido.
