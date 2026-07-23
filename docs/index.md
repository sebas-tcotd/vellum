# Vellum — Índice de Documentación del Proyecto

> Generado: 2026-04-04 | Escaneo: Rápido (basado en patrones)

---

## Visión General del Proyecto

- **Tipo:** Monorepo (pnpm workspaces + Turborepo)
- **Arquitectura:** Desktop App — Tauri 2 (Rust) + React 19 + paquetes TypeScript modulares
- **Lenguaje principal:** TypeScript 5.8.3 + Rust (Edition 2021)
- **Estado:** Scaffolding — estructura definida, implementaciones pendientes (Story 2.1+)

---

## Referencia Rápida por Parte

### desktop (`apps/desktop`)

- **Tipo:** Desktop (Tauri + Vite + React)
- **Entry point Frontend:** `apps/desktop/src/main.tsx`
- **Entry point Rust:** `apps/desktop/src-tauri/src/main.rs`
- **Puerto dev:** `http://localhost:1420`
- **Build:** `pnpm build` → ejecutable nativo empaquetado

### @vellum/core (`packages/core`)

- **Tipo:** Library TypeScript
- **Entry:** `packages/core/src/index.ts`
- **Dependencias internas:** ninguna
- **Estado:** Placeholder (barrel export vacío)

### @vellum/parser-cslmap (`packages/parser-cslmap`)

- **Tipo:** Library TypeScript
- **Entry:** `packages/parser-cslmap/src/index.ts`
- **Dependencias internas:** `@vellum/core`
- **Estado:** Placeholder

### @vellum/renderer-canvas (`packages/renderer-canvas`)

- **Tipo:** Library TypeScript
- **Entry:** `packages/renderer-canvas/src/index.ts`
- **Dependencias internas:** `@vellum/core`, `@vellum/theme-engine`
- **Estado:** Placeholder

### @vellum/theme-engine (`packages/theme-engine`)

- **Tipo:** Library TypeScript
- **Entry:** `packages/theme-engine/src/index.ts`
- **Dependencias internas:** `@vellum/core`
- **Estado:** Placeholder

### @vellum/ui (`packages/ui`)

- **Tipo:** Library TypeScript + React
- **Entry:** `packages/ui/src/index.ts`
- **Dependencias internas:** `@vellum/core`, `@vellum/renderer-canvas`, `@vellum/theme-engine`
- **Estado:** Placeholder (App devuelve `<div />`)

---

## Documentación Generada

| Documento                                                     | Descripción                                     |
| ------------------------------------------------------------- | ----------------------------------------------- |
| [Visión General del Proyecto](./project-overview.md)          | Resumen ejecutivo, stack, grafo de dependencias |
| [Análisis del Árbol de Fuentes](./source-tree-analysis.md)    | Árbol anotado de directorios y archivos         |
| [Arquitectura Desktop](./architecture-desktop.md)             | Arquitectura detallada de `apps/desktop`        |
| [Arquitectura de Integración](./integration-architecture.md)  | Cómo se comunican los paquetes del monorepo     |
| [Guía de Desarrollo](./development-guide.md)                  | Setup, comandos dev/build/lint, IPC Tauri       |
| [Inventario de Componentes](./component-inventory-desktop.md) | Componentes UI actuales y planificados          |
| [Schema .vellumstyle (EN)](./vellumstyle-schema.en.md)        | Referencia pública del schema de temas, v1      |
| [Schema .vellumstyle (ES)](./vellumstyle-schema.es.md)        | Referencia pública del schema de temas, v1      |

### Documentación Pendiente de Generar

- [Arquitectura — core](./architecture-core.md) _(To be generated)_
- [Arquitectura — parser-cslmap](./architecture-parser-cslmap.md) _(To be generated)_
- [Arquitectura — renderer-canvas](./architecture-renderer-canvas.md) _(To be generated)_
- [Arquitectura — theme-engine](./architecture-theme-engine.md) _(To be generated)_
- [Arquitectura — ui](./architecture-ui.md) _(To be generated)_

---

## Artefactos de Planificación Existentes

Ubicados en `_bmad-output/planning-artifacts/`:

| Documento                                                                                                                           | Descripción                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| [product-brief-Vellum.md](../_bmad-output/planning-artifacts/product-brief-Vellum.md)                                               | Brief del producto                   |
| [product-brief-Vellum-distillate.md](../_bmad-output/planning-artifacts/product-brief-Vellum-distillate.md)                         | Brief condensado                     |
| [prd.md](../_bmad-output/planning-artifacts/prd.md)                                                                                 | Documento de Requisitos del Producto |
| [architecture.md](../_bmad-output/planning-artifacts/architecture.md)                                                               | Diseño de arquitectura planificado   |
| [epics.md](../_bmad-output/planning-artifacts/epics.md)                                                                             | Épicas e historias de usuario        |
| [ux-design-specification.md](../_bmad-output/planning-artifacts/ux-design-specification.md)                                         | Especificación de diseño UX          |
| [implementation-readiness-report-2026-03-30b.md](../_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-30b.md) | Último reporte de readiness          |

---

## Inicio Rápido

```bash
# 1. Instalar dependencias
pnpm install

# 2. Iniciar en modo desarrollo
pnpm dev

# 3. Verificar tipos TypeScript
pnpm lint

# 4. Compilar para producción
pnpm build
```

**Prerrequisitos:** Node.js LTS, pnpm 10.33.0, Rust stable, dependencias del sistema para Tauri 2.
