# Vellum documentation

Technical documentation for the Vellum desktop application. The English and
Spanish trees intentionally mirror one another; use the language links at the
top of each index to switch without losing your place.

- [Español](../es/index.md)
- [Project README](../../README.md)

## Start here

| Document                                                | What it explains                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Project overview](project-overview.md)                 | What Vellum does, how the repository is shaped, and what is implemented today. |
| [Development guide](development-guide.md)               | Prerequisites, local setup, checks, tests, CI and common extension workflows.  |
| [Integration architecture](integration-architecture.md) | How parsing, domain data, rendering, export, themes and updates fit together.  |

## Architecture and source code

| Document                                                 | What it explains                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Desktop architecture](architecture-desktop.md)          | The Tauri composition root, native commands, plugins, updater and export sessions. |
| [Source tree analysis](source-tree-analysis.md)          | The important directories and entry points in the monorepo.                        |
| [UI component inventory](component-inventory-desktop.md) | The React components, hooks, store and design-system primitives in `@vellum/ui`.   |

## Rendering and formats

| Document                                                      | What it explains                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Transit rendering algorithm](transit-rendering-algorithm.md) | The path-based model used to keep transit lines continuous and visually stable. |
| [District rendering](district-rendering.md)                   | Why `.cslmap` districts are annotations rather than reconstructed polygons.     |
| [Forest rendering](forest-rendering.md)                       | The density-overlay approach for the forest data in `.cslmap`.                  |
| [`.vellumstyle` schema](vellumstyle-schema.md)                | The public v1 format for custom themes.                                         |

## Architecture Decision Records

Accepted decisions live in `docs/adr/`, one file per decision, four-digit
numbering. An accepted ADR is never rewritten — it is superseded by a new one
that references it. The tree is language-neutral and shared by both indexes.

| ADR                                                                  | What it decides                                                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [ADR-0001 — Rendering ownership](../adr/0001-rendering-ownership.md) | The `IRenderer` port and its segregated ports, the admissible adapters, and the single composition root. |

## A note about source and history

Most documents describe behavior that exists in the repository. The rendering
strategy notes also preserve the reasoning behind compatibility choices and
possible future improvements. That distinction matters: a recommendation is not
automatically an implemented feature.
