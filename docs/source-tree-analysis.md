# Vellum — Análisis del Árbol de Fuentes

> Generado: 2026-04-04 | Escaneo: Rápido

---

## Árbol Completo Anotado

```
c:\Proyectos\Vellum/                          ← Raíz del monorepo
│
├── package.json                              ← Manifest raíz (scripts: dev, build, test, lint)
├── pnpm-workspace.yaml                       ← Define workspaces: packages/* y apps/*
├── pnpm-lock.yaml                            ← Lockfile de dependencias
├── turbo.json                                ← Configuración de tareas Turborepo
├── tsconfig.json                             ← TypeScript base con path aliases
│
├── apps/
│   └── desktop/                             ← [PARTE: desktop] App Tauri principal
│       ├── package.json                     ← Deps: React, Tauri API, todos los @vellum/*
│       ├── vite.config.ts                   ← Config Vite (puerto 1420, plugin React)
│       ├── tsconfig.json                    ← TS config para el frontend
│       ├── tsconfig.node.json               ← TS config para scripts Node (vite.config)
│       ├── index.html                       ← HTML entry point del frontend
│       ├── public/                          ← Assets estáticos públicos
│       │   ├── tauri.svg
│       │   └── vite.svg
│       ├── src/
│       │   └── main.tsx                     ← [ENTRY POINT] Monta <App /> de @vellum/ui
│       └── src-tauri/                       ← [RUST/TAURI] Shell nativo
│           ├── Cargo.toml                   ← Manifest Rust: tauri v2, serde, serde_json
│           ├── Cargo.lock                   ← Lockfile Rust
│           ├── build.rs                     ← Build script (tauri-build)
│           ├── tauri.conf.json              ← Config Tauri: ventana 1200×800, bundling
│           ├── capabilities/
│           │   └── default.json            ← Permisos Tauri: core:default
│           ├── icons/                       ← Iconos de la app (PNG, ICO, ICNS)
│           ├── gen/                         ← Schemas generados por Tauri CLI
│           └── src/
│               ├── main.rs                  ← [ENTRY POINT RUST] Llama a vellum_lib::run()
│               └── lib.rs                   ← Bootstrap Tauri (Builder::default, sin comandos IPC aún)
│
├── packages/
│   ├── core/                               ← [PARTE: core] Base del dominio
│   │   ├── package.json                    ← Sin dependencias internas
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts                    ← Barrel export (placeholder)
│   │
│   ├── parser-cslmap/                      ← [PARTE: parser-cslmap] Parser del formato CSLMap
│   │   ├── package.json                    ← Dep: @vellum/core
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts                    ← Barrel export (placeholder)
│   │
│   ├── renderer-canvas/                    ← [PARTE: renderer-canvas] Renderizador Canvas
│   │   ├── package.json                    ← Deps: @vellum/core, @vellum/theme-engine
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts                    ← Barrel export (placeholder)
│   │
│   ├── theme-engine/                       ← [PARTE: theme-engine] Motor de temas
│   │   ├── package.json                    ← Dep: @vellum/core
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts                    ← Barrel export (placeholder)
│   │
│   └── ui/                                ← [PARTE: ui] Componentes React
│       ├── package.json                   ← Deps: @vellum/core, renderer-canvas, theme-engine, React 19
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                   ← Barrel: exporta { App }
│           └── App.tsx                    ← Componente raíz (placeholder — ver Story 2.1)
│
├── docs/                                  ← [KNOWLEDGE] Documentación del proyecto (este directorio)
│   ├── index.md
│   ├── project-overview.md
│   ├── source-tree-analysis.md
│   └── project-scan-report.json
│
└── _bmad-output/                          ← Artefactos de planificación BMad
    └── planning-artifacts/
        ├── prd.md
        ├── architecture.md
        ├── epics.md
        └── ...
```

---

## Directorios Críticos por Parte

| Directorio | Parte | Propósito |
|-----------|-------|-----------|
| `apps/desktop/src/` | desktop | Punto de entrada React |
| `apps/desktop/src-tauri/src/` | desktop | Shell Rust nativo |
| `apps/desktop/src-tauri/capabilities/` | desktop | Permisos de seguridad Tauri |
| `packages/core/src/` | core | Tipos y lógica base (implementar primero) |
| `packages/parser-cslmap/src/` | parser-cslmap | Parsing de documentos CSLMap |
| `packages/renderer-canvas/src/` | renderer-canvas | Renderizado visual en Canvas |
| `packages/theme-engine/src/` | theme-engine | Gestión de temas y tokens de diseño |
| `packages/ui/src/` | ui | Componentes React y pantallas |

---

## Puntos de Entrada

| Tipo | Archivo | Descripción |
|------|---------|-------------|
| Frontend (Vite) | `apps/desktop/src/main.tsx` | Monta `<App />` en el DOM |
| UI Component | `packages/ui/src/App.tsx` | Componente raíz de la aplicación |
| Tauri (Rust) | `apps/desktop/src-tauri/src/main.rs` | Inicia el proceso nativo |
| Tauri Library | `apps/desktop/src-tauri/src/lib.rs` | Configura el builder de Tauri |

---

## Estado del Código

> ⚠️ **Scaffolding en curso** — Todos los paquetes (`core`, `parser-cslmap`, `renderer-canvas`, `theme-engine`) contienen únicamente barrel exports vacíos. El componente `App.tsx` en `packages/ui` devuelve `<div />` con un comentario: *"Story 2.1 implementará el empty state real"*.

La arquitectura y las interfaces están definidas por los documentos de planificación en `_bmad-output/planning-artifacts/`, pero aún no se han trasladado al código.
