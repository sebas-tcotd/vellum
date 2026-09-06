# Documentación de Vellum

Documentación técnica de la aplicación de escritorio Vellum. El árbol en español
y el árbol en inglés usan los mismos nombres y la misma navegación para que puedas
cambiar de idioma sin perder el contexto.

- [English](../en/index.md)
- [README del proyecto](../../README.md)

## Para empezar

| Documento                                                  | Qué explica                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Visión general del proyecto](project-overview.md)         | Qué hace Vellum, cómo está organizado el repositorio y qué existe hoy.        |
| [Guía de desarrollo](development-guide.md)                 | Prerrequisitos, setup local, verificaciones, tests, CI y flujos de extensión. |
| [Arquitectura de integración](integration-architecture.md) | Cómo encajan parser, dominio, render, export, temas y updates.                |

## Arquitectura y código fuente

| Documento                                                      | Qué explica                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Arquitectura Desktop](architecture-desktop.md)                | Composition root de Tauri, comandos nativos, plugins, updater y sesiones de export. |
| [Análisis del árbol de fuentes](source-tree-analysis.md)       | Directorios y entry points importantes del monorepo.                                |
| [Inventario de componentes UI](component-inventory-desktop.md) | Componentes React, hooks, store y primitivas del design system en `@vellum/ui`.     |

## Renderizado y formatos

| Documento                                                              | Qué explica                                                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Algoritmo de renderizado de tránsito](transit-rendering-algorithm.md) | El modelo path-based que mantiene continuas y estables las líneas de tránsito.   |
| [Renderizado de distritos](district-rendering.md)                      | Por qué los distritos de `.cslmap` son anotaciones y no polígonos reconstruidos. |
| [Renderizado de bosques](forest-rendering.md)                          | El enfoque de overlay de densidad para los datos forestales de `.cslmap`.        |
| [Schema `.vellumstyle`](vellumstyle-schema.md)                         | El formato público v1 para crear temas personalizados.                           |

## Registros de decisiones de arquitectura (ADR)

Las decisiones aceptadas viven en `docs/adr/`, un archivo por decisión y
numeración de cuatro dígitos. Un ADR aceptado no se reescribe: se supersede con
uno nuevo que lo referencie. El árbol es neutral al idioma y lo comparten ambos
índices.

| ADR                                                                      | Qué decide                                                                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [ADR-0001 — Ownership del rendering](../adr/0001-rendering-ownership.md) | El puerto `IRenderer` y sus puertos segregados, los adapters admisibles y el composition root único. |

## Una nota sobre el alcance

La mayoría de los documentos describe comportamiento existente en el repositorio.
Las notas de estrategia de renderizado también conservan el razonamiento detrás de
decisiones de compatibilidad y posibles mejoras futuras. Una recomendación no es
automáticamente una funcionalidad implementada.
