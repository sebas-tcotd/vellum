# Vellum — Visión general del proyecto

---

## Resumen ejecutivo

Vellum es una app de escritorio nativa (Tauri 2 + React 19 + TypeScript + Rust) que abre archivos `.cslmap` exportados de Cities: Skylines 1 y los renderiza como mapas interactivos acelerados por GPU (MapLibre GL JS), en vez de dejarlos atrapados en el juego o reducidos a screenshots.

La versión actual de la aplicación es `v0.4.0`. El flujo principal del visor está implementado: carga de archivos, renderizado cartográfico, controles de capas, temas, exportación PNG/SVG, internacionalización, preferencias y chequeos de actualización en segundo plano. El empaquetado y la automatización de releases construyen los bundles de escritorio y los artefactos del updater; el exportador nativo de Vellum sigue siendo una dirección separada del visor v1.

## Clasificación

- **Tipo**: Monorepo (pnpm workspaces + Turborepo)
- **Arquitectura**: Desktop app — Tauri 2 (Rust) + React 19 + 6 packages TypeScript modulares en Clean Architecture con dependencias unidireccionales
- **Lenguaje principal**: TypeScript ~5.8.3 + Rust (Edition 2021)
- **Estado**: Producción — funcionalidad completa, en fase de hardening/distribución previo al release v1

## Stack tecnológico

| Categoría            | Tecnología                                 | Versión                                           |
| -------------------- | ------------------------------------------ | ------------------------------------------------- |
| Lenguaje             | TypeScript                                 | ~5.8.3                                            |
| Framework UI         | React                                      | ^19.1.0                                           |
| Build frontend       | Vite                                       | ^7.0.4                                            |
| Shell nativo         | Tauri                                      | ^2.x                                              |
| Lenguaje nativo      | Rust                                       | Edition 2021 (`1.96.0` via `rust-toolchain.toml`) |
| Gestor de paquetes   | pnpm                                       | `10.33.0` (exacta, pinneada)                      |
| Orquestador de build | Turborepo                                  | latest                                            |
| Renderer activo      | MapLibre GL JS                             | ^5.24.0                                           |
| Estilos              | Tailwind CSS v4 + Radix UI (patrón shadcn) | —                                                 |
| Tests TS             | Vitest                                     | ^4.1.2                                            |
| Tests E2E            | Playwright                                 | ^1.59.1 (1 smoke test)                            |
| i18n                 | react-i18next + i18next                    | en/es                                             |
| Estado               | Zustand                                    | ^5.0.12                                           |
| Preferencias         | tauri-plugin-store                         | `preferences.json`                                |
| Parser XML (Rust)    | quick-xml                                  | 0.36 (pinneado, no subir a 0.38)                  |

## Estructura del repositorio (7 partes)

| Parte                      | Tipo               | Rol                                                                    |
| -------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `apps/desktop`             | Desktop (Tauri)    | Composition root — único lugar que ensambla todo                       |
| `packages/core`            | Library TS         | Tipos de dominio + contrato IPC. Cero dependencias internas            |
| `packages/parser-cslmap`   | Library Rust+TS    | Adapter: XML `.cslmap` → `CityData`, crate Rust propio                 |
| `packages/renderer-webgl`  | Library TS         | **Activo.** `CityData` → GeoJSON → capas MapLibre GL JS                |
| `packages/renderer-canvas` | Library TS         | Legacy — Canvas 2D vía Web Worker, sin uso real hoy                    |
| `packages/theme-engine`    | Library TS         | `.vellumstyle` → `RenderStyleParams`, validación + migración de schema |
| `packages/ui`              | Library TS + React | Única capa con React — componentes, store Zustand, i18n                |

Ver [Análisis del Árbol de Fuentes](./source-tree-analysis.md) para el detalle archivo por archivo y [Arquitectura de Integración](./integration-architecture.md) para cómo se comunican.

## Qué hace la app hoy

- Abrir `.cslmap` por drag&drop o `Ctrl/Cmd+O`
- Renderizar 7 capas independientes: terreno, agua, calles, tránsito, edificios, bosques, distritos
- Pan/zoom acelerado por GPU, minimapa, modo limpio, rotación
- Exportar la vista actual como PNG (1x-4x, con ruta tiled para mapas grandes) o SVG editable
- Cambiar entre 5 temas visuales built-in
- Cargar archivos dañados o con DLC/mods desconocidos vía fallback controlado, sin crashear
- Interfaz completa en inglés y español, con selector persistente
- Chequeo de actualizaciones en background con notificación no intrusiva

## Documentación relacionada

| Documento                                                                | Descripción                                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [Análisis del Árbol de Fuentes](./source-tree-analysis.md)               | Árbol anotado de directorios y archivos                              |
| [Arquitectura Desktop](./architecture-desktop.md)                        | Arquitectura detallada de `apps/desktop`                             |
| [Arquitectura de Integración](./integration-architecture.md)             | Cómo se comunican los 7 paquetes del monorepo, contrato IPC completo |
| [Guía de Desarrollo](./development-guide.md)                             | Setup, comandos dev/build/lint/test, CI/CD                           |
| [Inventario de Componentes](./component-inventory-desktop.md)            | Componentes UI reales de `@vellum/ui`                                |
| [Schema `.vellumstyle`](./vellumstyle-schema.md)                         | Referencia pública del formato de temas, v1                          |
| [Algoritmo de renderizado de tránsito](./transit-rendering-algorithm.md) | Path-based rendering, evolución del algoritmo                        |
| [Estrategia de renderizado de distritos](./district-rendering.md)        | —                                                                    |
| [Estrategia de renderizado de bosques](./forest-rendering.md)            | —                                                                    |
| [`DESIGN.md`](../../DESIGN.md)                                           | Identidad visual de marca                                            |
| [`README.md`](../../README.md)                                           | Punto de entrada público del proyecto                                |

## Inicio rápido

```bash
git clone https://github.com/sebas-tcotd/vellum.git
cd vellum
pnpm install
pnpm dev
```

Consulta la [Guía de Desarrollo](./development-guide.md) para conocer los prerrequisitos completos y los comandos.
