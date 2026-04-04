# Vellum

Visor de escritorio para archivos **CSLMap** — exportaciones de mapas de Cities: Skylines.

Aplicación nativa multiplataforma construida con Tauri 2 (Rust) + React 19 + TypeScript, organizada como monorepo con pnpm workspaces y Turborepo.

> Estado actual: **scaffolding** — arquitectura y dependencias definidas; implementación interna de los paquetes en progreso.

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Shell de escritorio | Tauri + Rust | 2.x / Edition 2021 |
| UI | React | ^19.1.0 |
| Lenguaje | TypeScript | ~5.8.3 |
| Build / Dev server | Vite | ^7.0.4 |
| Orquestador de build | Turborepo | latest |
| Gestor de paquetes | pnpm | 10.33.0 |

---

## Arquitectura del Monorepo

```
vellum/
├── apps/
│   └── desktop/            ← App principal (Tauri shell + Vite/React)
└── packages/
    ├── core/               ← Tipos y lógica base del dominio
    ├── parser-cslmap/      ← Parser del formato CSLMap
    ├── renderer-canvas/    ← Renderizador Canvas 2D
    ├── theme-engine/       ← Motor de temas y design tokens
    └── ui/                 ← Componentes React reutilizables
```

### Grafo de dependencias

```mermaid
graph TD
  desktop --> ui
  desktop --> core
  desktop --> parser-cslmap
  desktop --> renderer-canvas
  desktop --> theme-engine

  ui --> core
  ui --> renderer-canvas
  ui --> theme-engine

  renderer-canvas --> core
  renderer-canvas --> theme-engine

  theme-engine --> core
  parser-cslmap --> core
```

`@vellum/core` es la dependencia base de todos los paquetes.

---

## Flujo de datos

```
Archivo .cslmap (disco)
        │
        ▼
 parser-cslmap          → Documento tipado (@vellum/core)
                                  │
                                  ▼
                    renderer-canvas + theme-engine
                                  │
                                  ▼
                           Canvas 2D / SVG
                                  │
                                  ▼
                            @vellum/ui (React)
                                  │
                                  ▼
                        apps/desktop (ventana Tauri)
```

---

## Requisitos Previos

| Herramienta | Versión | Verificar |
|-------------|---------|-----------|
| Node.js | LTS ≥ 18 | `node --version` |
| pnpm | 10.33.0 | `pnpm --version` |
| Rust | stable (Edition 2021) | `rustc --version` |
| Tauri CLI | ^2.x | `pnpm tauri --version` |

> Tauri 2 requiere dependencias del sistema operativo para compilar el shell nativo. Consulta la [documentación oficial de Tauri](https://tauri.app/start/prerequisites/) para tu plataforma.

---

## Instalación

```bash
git clone <repo-url>
cd Vellum
pnpm install
```

`pnpm install` instala dependencias de todos los workspaces y crea los symlinks entre paquetes internos.

---

## Comandos Principales

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Inicia la app en modo desarrollo (Vite + Tauri con hot-reload) |
| `pnpm build` | Compila todo el monorepo en orden topológico |
| `pnpm lint` | Verifica tipos TypeScript en todos los paquetes (`tsc --noEmit`) |
| `pnpm test` | Ejecuta pruebas *(framework aún no configurado)* |

### Solo frontend (sin proceso Tauri)

```bash
cd apps/desktop
pnpm dev:vite
```

---

## Documentación

La documentación técnica generada se encuentra en [`docs/`](docs/):

| Documento | Descripción |
|-----------|-------------|
| [project-overview.md](docs/project-overview.md) | Visión general, stack y estructura |
| [development-guide.md](docs/development-guide.md) | Setup, comandos y guías de desarrollo |
| [integration-architecture.md](docs/integration-architecture.md) | Grafo de integración y comunicación Tauri IPC |
| [architecture-desktop.md](docs/architecture-desktop.md) | Arquitectura interna de la app desktop |
| [source-tree-analysis.md](docs/source-tree-analysis.md) | Árbol de fuentes anotado |
| [component-inventory-desktop.md](docs/component-inventory-desktop.md) | Inventario de componentes React |
| [index.md](docs/index.md) | Índice completo de documentación |

Los artefactos de planificación (PRD, arquitectura, épicas, UX) están en [`_bmad-output/planning-artifacts/`](_bmad-output/planning-artifacts/).
