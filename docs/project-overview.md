# Vellum — Visión General del Proyecto

> Generado: 2026-04-04 | Escaneo: Rápido (basado en patrones)

---

## Resumen Ejecutivo

**Vellum** es una aplicación de escritorio multiplataforma en etapa inicial de desarrollo. El proyecto utiliza una arquitectura de **monorepo** organizada con pnpm workspaces y Turborepo, donde la lógica de dominio está separada en paquetes TypeScript independientes que alimentan una capa de presentación construida con React 19 y empaquetada para escritorio con Tauri 2 (Rust).

El estado actual del código es de **scaffolding** — la estructura del proyecto, las dependencias y la arquitectura modular están completamente definidas, pero las implementaciones internas de los paquetes son placeholders pendientes de desarrollo (referencia: "Story 2.1").

---

## Stack Tecnológico

| Categoría | Tecnología | Versión | Justificación |
|-----------|-----------|---------|--------------|
| Lenguaje Frontend | TypeScript | ~5.8.3 | Tipado estricto en todo el monorepo |
| Lenguaje Backend (Tauri) | Rust | Edition 2021 | Shell nativo de la aplicación de escritorio |
| Framework UI | React | ^19.1.0 | Renderizado de interfaz en la capa desktop |
| Build de Frontend | Vite | ^7.0.4 | Bundler y servidor de desarrollo |
| Framework Desktop | Tauri | ^2.x | Empaquetado nativo multiplataforma |
| Orquestador de Build | Turborepo | latest | Gestión de tareas y caché en monorepo |
| Gestor de Paquetes | pnpm | 10.33.0 | Workspaces y resolución de dependencias |
| CSS/Estilos | — | — | No detectado (por definir) |
| Testing | — | — | No detectado (por configurar) |
| CI/CD | — | — | No detectado (por configurar) |

---

## Clasificación de Arquitectura

| Propiedad | Valor |
|-----------|-------|
| Tipo de repositorio | Monorepo (pnpm workspaces) |
| Patrón arquitectónico | Modular / Capas separadas |
| Tipo de app destino | Aplicación de escritorio (desktop) |
| Número de partes | 6 (1 app + 5 packages) |

---

## Estructura del Repositorio

```
vellum-monorepo/
├── apps/
│   └── desktop/          ← Aplicación principal (Tauri + React)
└── packages/
    ├── core/             ← Tipos y lógica base del dominio
    ├── parser-cslmap/    ← Parser del formato CSLMap
    ├── renderer-canvas/  ← Renderizador sobre Canvas
    ├── theme-engine/     ← Motor de temas y estilos
    └── ui/               ← Componentes React (capa de presentación)
```

---

## Grafo de Dependencias Internas

```
desktop ──────────────────────────────────────┐
         ├── @vellum/ui                        │
         │     ├── @vellum/core                │
         │     ├── @vellum/renderer-canvas     │
         │     │     ├── @vellum/core          │
         │     │     └── @vellum/theme-engine  │
         │     │           └── @vellum/core    │
         │     └── @vellum/theme-engine        │
         ├── @vellum/core                      │
         ├── @vellum/parser-cslmap             │
         │     └── @vellum/core                │
         ├── @vellum/renderer-canvas           │
         └── @vellum/theme-engine              │
                                               ┘
```

`@vellum/core` es la dependencia base de todos los demás paquetes.

---

## Artefactos de Planificación Existentes

Los siguientes documentos de planificación fueron generados previamente y se encuentran en `_bmad-output/planning-artifacts/`:

| Documento | Descripción |
|-----------|-------------|
| [product-brief-Vellum.md](../_bmad-output/planning-artifacts/product-brief-Vellum.md) | Brief del producto |
| [product-brief-Vellum-distillate.md](../_bmad-output/planning-artifacts/product-brief-Vellum-distillate.md) | Versión condensada del brief |
| [prd.md](../_bmad-output/planning-artifacts/prd.md) | Documento de Requisitos del Producto |
| [architecture.md](../_bmad-output/planning-artifacts/architecture.md) | Diseño de arquitectura |
| [epics.md](../_bmad-output/planning-artifacts/epics.md) | Épicas e historias de usuario |
| [ux-design-specification.md](../_bmad-output/planning-artifacts/ux-design-specification.md) | Especificación de diseño UX |
| [implementation-readiness-report-2026-03-30b.md](../_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-30b.md) | Último reporte de readiness (30 Mar 2026) |
