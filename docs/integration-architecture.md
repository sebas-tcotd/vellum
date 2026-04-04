# Vellum — Arquitectura de Integración (Monorepo)

> Generado: 2026-04-04 | Escaneo: Rápido

---

## Tipo de Repositorio

**Monorepo** gestionado con **pnpm workspaces** y **Turborepo**.

- Las dependencias entre paquetes se resuelven usando el protocolo `workspace:*`
- Turborepo garantiza que los paquetes dependientes se construyan antes que sus consumidores
- Los path aliases de TypeScript (`@vellum/*` en `tsconfig.json` raíz) permiten imports directos desde fuentes en desarrollo

---

## Grafo de Integración

```
┌─────────────────────────────────────────────────────────┐
│                    apps/desktop                         │
│  (Tauri shell + Vite/React, punto de entrada final)     │
└───────┬──────────────┬──────────┬──────────┬───────────┘
        │              │          │          │
        ▼              ▼          ▼          ▼
   @vellum/ui   @vellum/core  @vellum/   @vellum/
                              parser-    renderer-
                              cslmap     canvas
        │                        │          │
        ├── @vellum/core          └─ core    └─ @vellum/core
        ├── @vellum/renderer-canvas           @vellum/theme-engine
        └── @vellum/theme-engine                   │
                   │                               └─ @vellum/core
                   └── @vellum/core
```

---

## Puntos de Integración

| Desde | Hacia | Tipo | Mecanismo | Estado |
|-------|-------|------|-----------|--------|
| `desktop` | `@vellum/ui` | Import directo | pnpm workspace + Vite | Conectado |
| `desktop` | `@vellum/core` | Import directo | pnpm workspace + TS | Conectado |
| `desktop` | `@vellum/parser-cslmap` | Import directo | pnpm workspace + TS | Conectado |
| `desktop` | `@vellum/renderer-canvas` | Import directo | pnpm workspace + TS | Conectado |
| `desktop` | `@vellum/theme-engine` | Import directo | pnpm workspace + TS | Conectado |
| `@vellum/ui` | `@vellum/renderer-canvas` | Import directo | pnpm workspace + TS | Conectado |
| `@vellum/ui` | `@vellum/theme-engine` | Import directo | pnpm workspace + TS | Conectado |
| `@vellum/ui` | `@vellum/core` | Import directo | pnpm workspace + TS | Conectado |
| `@vellum/renderer-canvas` | `@vellum/theme-engine` | Import directo | pnpm workspace + TS | Conectado |
| `@vellum/renderer-canvas` | `@vellum/core` | Import directo | pnpm workspace + TS | Conectado |
| `@vellum/theme-engine` | `@vellum/core` | Import directo | pnpm workspace + TS | Conectado |
| `@vellum/parser-cslmap` | `@vellum/core` | Import directo | pnpm workspace + TS | Conectado |
| `desktop (Rust)` | `desktop (React)` | IPC Tauri | `tauri::Builder` | Scaffolded (sin comandos IPC aún) |

---

## Protocolo de Comunicación Tauri (Frontend ↔ Rust)

El bridge entre el frontend React y el proceso nativo Rust se gestiona a través del API de Tauri:

- **Frontend → Rust:** `invoke()` de `@tauri-apps/api` (no implementado aún)
- **Rust → Frontend:** eventos Tauri (`emit`, listeners) (no implementado aún)
- **Permisos activos:** `core:default` (capability `default.json`)
- **Ventana:** `main` — 1200×800px (mín. 900×600)

> El archivo `lib.rs` actual solo hace `tauri::Builder::default().run()` sin registrar comandos IPC. Los comandos se registrarán al implementar las historias que requieran acceso al sistema de archivos o funcionalidades nativas.

---

## Flujo de Datos (Diseñado — Pendiente de Implementación)

```
Archivo CSLMap (disco)
        │
        ▼
@vellum/parser-cslmap   ──── parsea ────▶  Documento (tipos de @vellum/core)
                                                    │
                                                    ▼
                                        @vellum/renderer-canvas
                                          + @vellum/theme-engine
                                                    │
                                                    ▼
                                           Canvas 2D / SVG
                                                    │
                                                    ▼
                                          @vellum/ui (React)
                                                    │
                                                    ▼
                                        apps/desktop (Tauri window)
```

---

## Gestión de Tareas Turborepo

```json
{
  "build":  { "dependsOn": ["^build"], "outputs": ["dist/**"] },
  "test":   { "dependsOn": ["^build"] },
  "lint":   { "dependsOn": [] },
  "dev":    { "dependsOn": ["^build"], "persistent": true, "cache": false }
}
```

El operador `^` garantiza que al ejecutar `turbo build` desde la raíz, los paquetes se construyen en orden topológico (de `core` hacia `desktop`).

---

## project-parts.json

```json
{
  "repository_type": "monorepo",
  "parts": [
    { "part_id": "desktop",          "type": "desktop",  "root": "apps/desktop",          "entry": "src/main.tsx" },
    { "part_id": "core",             "type": "library",  "root": "packages/core",          "entry": "src/index.ts" },
    { "part_id": "parser-cslmap",    "type": "library",  "root": "packages/parser-cslmap", "entry": "src/index.ts" },
    { "part_id": "renderer-canvas",  "type": "library",  "root": "packages/renderer-canvas","entry": "src/index.ts" },
    { "part_id": "theme-engine",     "type": "library",  "root": "packages/theme-engine",  "entry": "src/index.ts" },
    { "part_id": "ui",               "type": "library",  "root": "packages/ui",            "entry": "src/index.ts" }
  ],
  "integration_points": [
    { "from": "desktop",         "to": "ui",              "type": "workspace-import" },
    { "from": "desktop",         "to": "core",            "type": "workspace-import" },
    { "from": "desktop",         "to": "parser-cslmap",   "type": "workspace-import" },
    { "from": "desktop",         "to": "renderer-canvas", "type": "workspace-import" },
    { "from": "desktop",         "to": "theme-engine",    "type": "workspace-import" },
    { "from": "ui",              "to": "renderer-canvas", "type": "workspace-import" },
    { "from": "ui",              "to": "theme-engine",    "type": "workspace-import" },
    { "from": "ui",              "to": "core",            "type": "workspace-import" },
    { "from": "renderer-canvas", "to": "theme-engine",    "type": "workspace-import" },
    { "from": "renderer-canvas", "to": "core",            "type": "workspace-import" },
    { "from": "theme-engine",    "to": "core",            "type": "workspace-import" },
    { "from": "parser-cslmap",   "to": "core",            "type": "workspace-import" },
    { "from": "desktop (React)", "to": "desktop (Rust)",  "type": "tauri-ipc", "status": "scaffolded" }
  ]
}
```
