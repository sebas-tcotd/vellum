# Vellum Desktop — Documento de Arquitectura

> Generado: 2026-04-04 | Escaneo: Rápido | Parte: `desktop`

---

## Resumen Ejecutivo

`apps/desktop` es la aplicación de escritorio principal de Vellum. Es un shell Tauri 2 (Rust) que embebe un frontend React 19 construido con Vite 7. La app integra todos los paquetes del monorepo y constituye el único punto de distribución final hacia el usuario.

**Estado actual:** Scaffolding completo — la infraestructura está lista pero la lógica de dominio y la interfaz de usuario son placeholders pendientes de implementación.

---

## Stack Tecnológico

| Capa                 | Tecnología           | Versión                 |
| -------------------- | -------------------- | ----------------------- |
| Shell nativo         | Rust + Tauri         | Edition 2021 / Tauri ^2 |
| Build nativo         | tauri-build          | ^2                      |
| Serialización        | serde + serde_json   | ^1                      |
| Frontend framework   | React                | ^19.1.0                 |
| Frontend build       | Vite                 | ^7.0.4                  |
| Transpilador         | TypeScript           | ~5.8.3                  |
| Plugin React/Vite    | @vitejs/plugin-react | ^4.6.0                  |
| API Tauri (frontend) | @tauri-apps/api      | ^2                      |

---

## Patrón Arquitectónico

**Shell/Renderer + Modular Libraries**

```
┌─────────────────────────────────────────┐
│           Proceso Tauri (Rust)          │  ← Shell nativo
│  ┌───────────────────────────────────┐  │
│  │    WebView (Vite/React frontend)  │  │  ← Renderer
│  │                                   │  │
│  │  main.tsx                         │  │
│  │    └── <App /> (@vellum/ui)        │  │
│  │          ├── @vellum/renderer-canvas│  │
│  │          ├── @vellum/theme-engine  │  │
│  │          ├── @vellum/core          │  │
│  │          └── @vellum/parser-cslmap │  │
│  └──────────────── IPC ───────────────┘  │
│           (invoke / events)              │
└─────────────────────────────────────────┘
```

---

## Componentes

### Frontend (React/TypeScript)

| Archivo          | Descripción                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `src/main.tsx`   | Punto de entrada: monta `<App />` de `@vellum/ui` en `#root`       |
| `vite.config.ts` | Config Vite: puerto 1420, plugin React, integración HMR para Tauri |
| `index.html`     | HTML shell con `<div id="root">`                                   |

### Backend (Rust/Tauri)

| Archivo                     | Descripción                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ |
| `src-tauri/src/main.rs`     | Punto de entrada Rust — invoca `vellum_lib::run()`                             |
| `src-tauri/src/lib.rs`      | Bootstrap Tauri: `Builder::default().run()` — sin comandos IPC registrados aún |
| `src-tauri/tauri.conf.json` | Configuración de la app: ventana, bundling, CSP, iconos                        |
| `src-tauri/Cargo.toml`      | Dependencias Rust: tauri, serde, serde_json                                    |
| `src-tauri/build.rs`        | Build script requerido por tauri-build                                         |

### Configuración

| Archivo                               | Descripción                                                     |
| ------------------------------------- | --------------------------------------------------------------- |
| `src-tauri/capabilities/default.json` | Permisos: `core:default` para la ventana `main`                 |
| `src-tauri/tauri.conf.json`           | Ventana 1200×800 (mín. 900×600), CSP: null (dev), bundling: all |

---

## Configuración de la Ventana Principal

```json
{
  "title": "Vellum",
  "width": 1200,
  "height": 800,
  "minWidth": 900,
  "minHeight": 600
}
```

---

## Proceso de Build

```
pnpm build:vite
  └── tsc --noEmit (verificación de tipos)
  └── vite build → apps/desktop/dist/

pnpm build (tauri build)
  └── pnpm build:vite (beforeBuildCommand)
  └── cargo build --release (Rust)
  └── Empaquetado nativo (MSI/NSIS en Windows, DMG en macOS, AppImage en Linux)
```

---

## Proceso de Desarrollo

```
pnpm dev (tauri dev)
  └── pnpm dev:vite (beforeDevCommand)
      └── vite serve → http://localhost:1420
  └── cargo run (Rust, conecta al devUrl)
```

HMR (Hot Module Replacement) configurado con soporte para `TAURI_DEV_HOST` (desarrollo remoto/móvil).

---

## Seguridad

| Aspecto                      | Configuración actual                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| CSP                          | `null` (sin restricciones — solo aceptable en desarrollo; **debe configurarse para producción**) |
| Permisos Tauri               | `core:default` únicamente                                                                        |
| Comandos IPC                 | Ninguno registrado aún                                                                           |
| Acceso a sistema de archivos | No concedido                                                                                     |

---

## Dependencias Internas (workspace)

| Paquete                   | Rol                            |
| ------------------------- | ------------------------------ |
| `@vellum/ui`              | Componentes React — todo el UI |
| `@vellum/core`            | Tipos y utilidades base        |
| `@vellum/parser-cslmap`   | Parsing de documentos          |
| `@vellum/renderer-canvas` | Renderizado visual             |
| `@vellum/theme-engine`    | Sistema de temas               |

---

## Próximos Pasos de Implementación

1. Implementar el empty state en `@vellum/ui` (Story 2.1)
2. Definir tipos en `@vellum/core`
3. Implementar parsing en `@vellum/parser-cslmap`
4. Implementar motor de temas en `@vellum/theme-engine`
5. Implementar renderizador en `@vellum/renderer-canvas`
6. Registrar comandos IPC en `lib.rs` cuando se requiera acceso nativo
7. Configurar CSP para producción en `tauri.conf.json`
