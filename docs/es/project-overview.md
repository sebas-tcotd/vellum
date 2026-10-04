# Vellum — Visión general del proyecto

---

## Resumen ejecutivo

Vellum es una app de escritorio nativa (Tauri 2 + React 19 + TypeScript + Rust) que abre ciudades de Cities: Skylines 1 y las renderiza como mapas interactivos acelerados por GPU (MapLibre GL JS), en vez de dejarlas atrapadas en el juego o reducidas a screenshots. Una ciudad llega a Vellum de dos formas: como `.vellummap`, escrito dentro del juego por el mod Vellum Bridge, o como `.cslmap`, exportado por CSL Map View.

La versión actual está en [`VERSION`](../../VERSION) y cada release se describe en el [changelog](../../CHANGELOG.md). El flujo del visor está completo: carga de archivos, renderizado cartográfico, controles de capas, vista esquemática del tránsito, inspección de lugares, temas, exportación PNG/SVG, internacionalización, preferencias y chequeos de actualización. Vellum Bridge exporta documentos `.vellummap` desde el juego; su publicación en el Steam Workshop es el paso que falta antes de v1.0.

## Clasificación

- **Tipo**: Monorepo (pnpm workspaces + Turborepo)
- **Arquitectura**: Desktop app — Tauri 2 (Rust) + React 19 + 5 packages modulares con dependencias unidireccionales, más un mod de CS1 en C#
- **Lenguaje principal**: TypeScript ~5.8.3 + Rust (Edition 2021)
- **Estado**: visor completo y distribuible; Vellum Bridge en camino al Steam Workshop

## Stack tecnológico

| Categoría            | Tecnología                                 | Versión                                           |
| -------------------- | ------------------------------------------ | ------------------------------------------------- |
| Lenguaje             | TypeScript                                 | ~5.8.3                                            |
| Framework UI         | React                                      | ^19.3.0                                           |
| Build frontend       | Vite                                       | ^7.3.6                                            |
| Shell nativo         | Tauri                                      | ^2.x                                              |
| Lenguaje nativo      | Rust                                       | Edition 2021 (`1.96.0` via `rust-toolchain.toml`) |
| Gestor de paquetes   | pnpm                                       | `10.33.0` (exacta, pinneada)                      |
| Orquestador de build | Turborepo                                  | `2.9.14`                                          |
| Renderer activo      | MapLibre GL JS                             | ^6.9.0                                            |
| Estilos              | Tailwind CSS v4 + Radix UI (patrón shadcn) | —                                                 |
| Tests TS             | Vitest                                     | ^4.1.11                                           |
| Tests E2E            | tauri-driver + webdriverio (vía Vitest)    | webdriverio ^9.31.7                               |
| i18n                 | react-i18next + i18next                    | en/es                                             |
| Estado               | Zustand                                    | ^5.0.15                                           |
| Preferencias         | tauri-plugin-store                         | `preferences.json`                                |
| Parser XML (Rust)    | quick-xml                                  | 0.41                                              |
| Mod del juego        | C# sobre .NET Framework 3.5 (Mono de CS1)  | —                                                 |

## Estructura del repositorio

| Parte                     | Tipo               | Rol                                                                    |
| ------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `apps/desktop`            | Desktop (Tauri)    | Composition root — único lugar que ensambla todo                       |
| `apps/landing`            | Web (Vite + React) | Sitio del proyecto, publicado en GitHub Pages                          |
| `packages/core`           | Library TS         | Tipos de dominio + contrato IPC. Cero dependencias internas            |
| `packages/parser-cslmap`  | Library Rust+TS    | Lectores: `.cslmap` (XML) y `.vellummap` (zip) → `CityData`            |
| `packages/renderer-webgl` | Library TS         | **Activo.** `CityData` → GeoJSON → capas MapLibre GL JS                |
| `packages/theme-engine`   | Library TS         | `.vellumstyle` → `RenderStyleParams`, validación + migración de schema |
| `packages/ui`             | Library TS + React | Única capa con React — componentes, store Zustand, i18n                |
| `tools/vellum-bridge`     | Mod C# de CS1      | Exporta la ciudad a `.vellummap` desde el juego                        |

Ver [Análisis del Árbol de Fuentes](./source-tree-analysis.md) para el detalle archivo por archivo y [Arquitectura de Integración](./integration-architecture.md) para cómo se comunican.

## Qué hace la app hoy

- Abrir `.vellummap` y `.cslmap` por drag&drop o `Ctrl/Cmd+O`
- Renderizar 7 capas independientes, cada una con sus opciones: terreno, basemap (incluye agua), calles, tránsito, edificios, bosques y distritos
- Nombres de calles y ancho real de las vías con zoom de detalle
- Ver el tránsito como mapa geográfico o como diagrama esquemático octilineal
- Inspeccionar distritos, parques y edificios en una tarjeta lateral
- Pan/zoom acelerado por GPU, minimapa, zoom preciso, modo limpio, rotación y hoja de atajos
- Exportar la vista actual como PNG (1x-4x, con ruta tiled para mapas grandes) o SVG editable
- Cambiar entre 5 temas visuales built-in o cargar `.vellumstyle` propios
- Cargar archivos dañados o con DLC/mods desconocidos vía fallback controlado, sin crashear
- Interfaz completa en inglés y español, con selector persistente
- Chequeo de actualizaciones en background con notificación no intrusiva

## Documentación relacionada

| Documento                                                                | Descripción                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [Análisis del Árbol de Fuentes](./source-tree-analysis.md)               | Árbol anotado de directorios y archivos                            |
| [Arquitectura Desktop](./architecture-desktop.md)                        | Arquitectura detallada de `apps/desktop`                           |
| [Arquitectura de Integración](./integration-architecture.md)             | Cómo se comunican los paquetes del monorepo, contrato IPC completo |
| [Guía de Desarrollo](./development-guide.md)                             | Setup, comandos dev/build/lint/test, CI/CD                         |
| [Inventario de Componentes](./component-inventory-desktop.md)            | Componentes UI reales de `@vellum/ui`                              |
| [Documento `.vellummap`](./vellummap-format.md)                          | Contrato del documento de ciudad v1                                |
| [Schema `.vellumstyle`](./vellumstyle-schema.md)                         | Referencia pública del formato de temas, v1                        |
| [Algoritmo de renderizado de tránsito](./transit-rendering-algorithm.md) | Path-based rendering, evolución del algoritmo                      |
| [Estrategia de renderizado de distritos](./district-rendering.md)        | —                                                                  |
| [Estrategia de renderizado de bosques](./forest-rendering.md)            | —                                                                  |
| [`DESIGN.md`](../../DESIGN.md)                                           | Identidad visual de marca                                          |
| [`README.md`](../../README.md)                                           | Punto de entrada público del proyecto                              |

## Inicio rápido

```bash
git clone https://github.com/sebas-tcotd/vellum.git
cd vellum
pnpm install
pnpm dev
```

Consulta la [Guía de Desarrollo](./development-guide.md) para conocer los prerrequisitos completos y los comandos.
