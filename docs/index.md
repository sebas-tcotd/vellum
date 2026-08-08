# Vellum — Índice de Documentación del Proyecto

> Generado: 2026-08-07 | Escaneo: Deep (lectura de código en los 7 packages) | Reemplaza el índice de 2026-04-04, que describía el proyecto en estado scaffolding ("App devuelve `<div />`", packages "Placeholder")

---

## Visión general del proyecto

- **Tipo:** Monorepo (pnpm workspaces + Turborepo)
- **Arquitectura:** Desktop app — Tauri 2 (Rust) + React 19 + 6 packages TypeScript en Clean Architecture, dependencias unidireccionales
- **Lenguaje principal:** TypeScript ~5.8.3 + Rust (Edition 2021)
- **Estado:** Producción — 7 épicas core completas, empaquetado/distribución final en progreso (story 7.5)

## Referencia rápida por parte

### desktop (`apps/desktop`)

- **Tipo:** Desktop (Tauri + Vite + React)
- **Entry point frontend:** `apps/desktop/src/main.tsx`
- **Entry point Rust:** `apps/desktop/src-tauri/src/main.rs`
- **Puerto dev:** `http://localhost:1420`
- **Build:** `pnpm build` → instaladores nativos (`.msi` firmado, `.dmg`, `.AppImage`)
- **Estado:** Implementado — 9 comandos IPC, menú nativo, updater en background, sesiones de export transaccionales

### @vellum/core (`packages/core`)

- **Tipo:** Library TypeScript, cero dependencias internas
- **Entry:** `packages/core/src/index.ts`
- **Estado:** Implementado — modelo de dominio completo (`CityData`, `IRenderer`, `VellumError`, etc.) + contrato IPC

### @vellum/parser-cslmap (`packages/parser-cslmap`)

- **Tipo:** Library Rust (crate propio) + adapter TS/napi
- **Dependencias internas:** `@vellum/core`
- **Estado:** Implementado — parser streaming completo (roads, buildings, transit, districts, parks, terrain) con fallback por `ItemClass` desconocido

### @vellum/renderer-webgl (`packages/renderer-webgl`)

- **Tipo:** Library TypeScript, ~100 archivos fuente
- **Dependencias internas:** `@vellum/core`
- **Estado:** **Activo** — implementa `IRenderer`, 7 capas MapLibre, pipeline de export PNG (tiled + legacy) y SVG

### @vellum/renderer-canvas (`packages/renderer-canvas`)

- **Tipo:** Library TypeScript
- **Dependencias internas:** `@vellum/core`, `@vellum/theme-engine`
- **Estado:** Legacy — implementa `IRenderer`, testeado, pero sin uso real en el árbol de imports actual (ver [Arquitectura de Integración](./integration-architecture.md))

### @vellum/theme-engine (`packages/theme-engine`)

- **Tipo:** Library TypeScript
- **Dependencias internas:** `@vellum/core`
- **Estado:** Implementado — carga, validación y migración de schema de 5 temas built-in

### @vellum/ui (`packages/ui`)

- **Tipo:** Library TypeScript + React (única capa con React)
- **Dependencias internas:** `@vellum/core`, `@vellum/renderer-webgl`, `@vellum/renderer-canvas`, `@vellum/theme-engine`
- **Estado:** Implementado — ~41 archivos fuente, 34 de test; ver [Inventario de Componentes](./component-inventory-desktop.md)

---

## Documentación generada

| Documento                                                                                                       | Descripción                                                                            |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Visión General del Proyecto](./project-overview.md)                                                            | Resumen ejecutivo, stack, grafo de dependencias, qué hace la app hoy                   |
| [Análisis del Árbol de Fuentes](./source-tree-analysis.md)                                                      | Árbol anotado de directorios y archivos, 7 partes                                      |
| [Arquitectura Desktop](./architecture-desktop.md)                                                               | Arquitectura detallada de `apps/desktop`: comandos IPC, menú nativo, updater, testing  |
| [Arquitectura de Integración](./integration-architecture.md)                                                    | Cómo se comunican los 7 paquetes, contrato IPC completo, flujo de parseo/render/export |
| [Guía de Desarrollo](./development-guide.md)                                                                    | Setup, comandos dev/build/lint/test, CI/CD, agregar packages/comandos IPC              |
| [Inventario de Componentes](./component-inventory-desktop.md)                                                   | Todos los componentes/hooks/store reales de `@vellum/ui`                               |
| [Schema .vellumstyle (EN)](./vellumstyle-schema.en.md)                                                          | Referencia pública del schema de temas, v1                                             |
| [Schema .vellumstyle (ES)](./vellumstyle-schema.es.md)                                                          | Referencia pública del schema de temas, v1                                             |
| [Algoritmo de Renderizado de Tránsito](./transit-rendering-algorithm.md)                                        | Path-based rendering, evolución del algoritmo                                          |
| [Estrategia de Renderizado de Distritos](./district-rendering.md)                                               | Compatibilidad CSLMap para distritos                                                   |
| [Estrategia de Renderizado de Bosques](./forest-rendering.md)                                                   | Compatibilidad CSLMap para bosques                                                     |
| [Research: geometría vectorial de terreno](./research/technical-terrain-vector-geometry-research-2026-06-05.md) | Investigación técnica, 2026-06-05                                                      |

> Las arquitecturas por-package que la versión anterior de este índice marcaba como _(To be generated)_ (`architecture-core.md`, `architecture-parser-cslmap.md`, `architecture-renderer-canvas.md`, `architecture-theme-engine.md`, `architecture-ui.md`) se consolidaron deliberadamente en [Arquitectura de Integración](./integration-architecture.md) y [Inventario de Componentes](./component-inventory-desktop.md) — packages de este tamaño (6-100 archivos) no justifican 5 documentos casi vacíos por separado.

## Otra documentación en el repo

| Documento                                     | Descripción                                         |
| --------------------------------------------- | --------------------------------------------------- |
| [`README.md`](../README.md)                   | Punto de entrada público del proyecto (inglés)      |
| [README (Español)](./README.es.md)            | Punto de entrada público del proyecto (español)     |
| [`DESIGN.md`](../DESIGN.md)                   | Identidad visual de marca                           |
| [`AGENTS.md`](../AGENTS.md)                   | Onboarding compacto para sesiones OpenCode          |
| [`CLAUDE.md`](../CLAUDE.md)                   | Reglas de arquitectura y dominio para agentes de IA |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md)       | Flujo de contribución, checklist de PR              |
| [`SECURITY.md`](../SECURITY.md)               | Política de reporte de vulnerabilidades             |
| [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) | Código de conducta                                  |

## Artefactos de planificación existentes

Ubicados en `_bmad-output/planning-artifacts/` (symlink a `../vellum-context/_bmad-output`):

| Documento                                                                                                   | Descripción                                                                      |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [product-brief-Vellum.md](../_bmad-output/planning-artifacts/product-brief-Vellum.md)                       | Brief del producto                                                               |
| [product-brief-Vellum-distillate.md](../_bmad-output/planning-artifacts/product-brief-Vellum-distillate.md) | Brief condensado                                                                 |
| [prd.md](../_bmad-output/planning-artifacts/prd.md)                                                         | Documento de Requisitos del Producto                                             |
| [architecture.md](../_bmad-output/planning-artifacts/architecture.md)                                       | Diseño de arquitectura planificado                                               |
| [epics.md](../_bmad-output/planning-artifacts/epics.md)                                                     | Épicas e historias de usuario                                                    |
| [ux-design-specification.md](../_bmad-output/planning-artifacts/ux-design-specification.md)                 | Especificación de diseño UX                                                      |
| [project-context.md](../_bmad-output/project-context.md)                                                    | Reglas críticas para agentes de IA — leer antes de implementar código no trivial |

Estado de sprint por historia: `_bmad-output/implementation-artifacts/sprint-status.yaml` (épicas 1-7; solo la story 7.5 — empaquetado/distribución — sigue en progreso al momento de este escaneo).

---

## Inicio rápido

```bash
# 1. Instalar dependencias
pnpm install

# 2. Iniciar en modo desarrollo
pnpm dev

# 3. Verificar tipos TypeScript
pnpm lint

# 4. Correr tests
pnpm test

# 5. Compilar para producción
pnpm build
```

**Prerrequisitos:** Node.js 20, pnpm `10.33.0`, Rust `1.96.0` (`rust-toolchain.toml`), Tauri CLI 2.x, + dependencias nativas de Tauri según el OS. Ver [Guía de Desarrollo](./development-guide.md) para el detalle completo.

No hace falta Cities: Skylines ni una ciudad propia para probar la app — hay fixtures `.cslmap` reales en [`packages/parser-cslmap/fixtures`](../packages/parser-cslmap/fixtures).
