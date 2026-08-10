# Vellum — Guía de Desarrollo

> Generado: 2026-08-07 | Escaneo: Deep | Reemplaza la versión de 2026-04-04 (proyecto en estado scaffolding)

Para el flujo de PR, convenciones de commits y checklist de contribución, ver [`CONTRIBUTING.md`](../CONTRIBUTING.md) — este documento cubre el detalle técnico de setup y comandos que `CONTRIBUTING.md` resume brevemente.

---

## Prerrequisitos

| Herramienta | Versión                                  | Verificar              |
| ----------- | ---------------------------------------- | ---------------------- |
| Node.js     | 20                                       | `node --version`       |
| pnpm        | `10.33.0` (pinneado en `packageManager`) | `pnpm --version`       |
| Rust        | `1.96.0` (`rust-toolchain.toml`)         | `rustc --version`      |
| Tauri CLI   | `2.x`                                    | `pnpm tauri --version` |

Instalar los [prerrequisitos de Tauri 2](https://v2.tauri.app/start/prerequisites/) antes de `pnpm install`: WebKitGTK + build tools en Linux, Xcode Command Line Tools en macOS, Microsoft C++ Build Tools + WebView2 en Windows. pnpm no instala estas dependencias nativas.

## Setup

```bash
git clone https://github.com/sebas-tcotd/vellum.git
cd vellum
pnpm install              # o `pnpm approve-builds` primero si el postinstall de esbuild está bloqueado
```

No hace falta tener Cities: Skylines ni una ciudad propia — fixtures `.cslmap` reales están en [`packages/parser-cslmap/fixtures`](../packages/parser-cslmap/fixtures) (5 ciudades reales de 11-24MB + 5 fixtures chicos para casos borde: corrupto, DLC desconocido, etc.).

## Modo desarrollo

```bash
pnpm dev                          # Vite + Tauri, abre la ventana nativa (puerto Vite 1420, HMR 1421)
cd apps/desktop && pnpm dev:vite  # solo frontend, sin proceso Tauri
```

## Build

```bash
pnpm build                 # todos los packages, orden topológico vía Turborepo
```

Orden topológico: `core` → `theme-engine` / `parser-cslmap` → `renderer-canvas` / `renderer-webgl` → `ui` → `desktop`.

### Limpiar artefactos de build obsoletos

```bash
rm -rf .turbo apps/desktop/dist packages/*/dist
find . -name "tsconfig.tsbuildinfo" -delete && pnpm build
```

## Lint y arquitectura

```bash
pnpm lint                  # tsc --noEmit en todos los packages
pnpm check:architecture    # regla ESLint no-restricted-imports — enforcea el grafo de dependencias unidireccional
pnpm format                # prettier --write
pnpm format:check          # prettier --check (usado en CI)
```

## Tests

```bash
pnpm test                          # todos los packages vía Turborepo (Vitest)
pnpm --filter @vellum/<pkg> test   # un package específico
pnpm --filter @vellum/ui test -- MapLibreRoot.test.tsx   # un archivo específico

cargo fmt --all -- --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
```

**Volumen actual de tests** (escaneo 2026-08-07):

| Área                                                  | Cantidad                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Vitest (`*.test.ts`/`*.test.tsx`, todos los packages) | ~110 archivos                                                                                          |
| `#[test]` Rust (`apps/desktop/src-tauri`)             | 94 tests                                                                                               |
| Playwright E2E (`apps/desktop/tests/e2e`)             | 1 spec (`smoke.spec.ts`) — solo valida que la app carga; no cubre aún drag&drop/render/export completo |

```bash
pnpm test:e2e   # requiere tauri-driver instalado y la app compilada; NO corre en CI (ver ci.yml)
```

**Al agregar un campo a `RendererTokens`/`tokens.ts`**: rompe el typecheck de todos los `MOCK_TOKENS` en tests existentes — no hay factory helper todavía, hay que actualizar cada uno manualmente en el mismo PR.

## CI/CD

| Workflow                                                          | Trigger          | Qué valida                                                                                                 |
| ----------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| [`ci.yml`](../.github/workflows/ci.yml)                           | Push/PR a `main` | Build, Vitest, Rust tests, lint TS + Clippy, formato. Playwright **no** corre acá (requiere tauri-driver). |
| [`publish-release.yml`](../.github/workflows/publish-release.yml) | Tag `v*`         | Build multiplataforma (Windows `.msi` firmado, macOS `.dmg`, Linux `.AppImage`) + publicación de release   |

## Comandos IPC — agregar uno nuevo

1. Definir el comando en `packages/core/src/ipc-contract.ts` (`IPC_COMMANDS`) y su tipo de payload/resultado
2. Implementar el `#[tauri::command]` correspondiente en `apps/desktop/src-tauri/src/commands.rs`, con doc comment `///` + sección `# Errors`
3. Registrar en `invoke_handler!()` dentro de `lib.rs`
4. **Ambos lados en el mismo commit** — es una regla dura del proyecto; consulta la documentación del contrato IPC en [`integration-architecture.md`](integration-architecture.md)

## Agregar un package nuevo al monorepo

1. `packages/<nombre>/package.json` (`"name": "@vellum/<nombre>"`)
2. `packages/<nombre>/tsconfig.json` con `"composite": true`
3. `packages/<nombre>/src/index.ts` (barrel export)
4. Path alias en el `tsconfig.json` raíz: `"@vellum/<nombre>": ["./packages/<nombre>/src/index.ts"]`
5. `pnpm install` desde la raíz

Para que el package sea importable desde otro (IDE + lint funcionando):

6. `"@vellum/<nombre>": "workspace:*"` en `dependencies` del consumidor
7. `{ "path": "../<nombre>" }` en `references` del `tsconfig.json` del consumidor
8. `pnpm --filter @vellum/<nombre> build`
9. Verificar con `pnpm lint`

> Ambos pasos 4 y 7 son necesarios — `@vellum/renderer-webgl` funcionó en `desktop` pero no en `ui` durante un tiempo porque solo tenía la referencia en un lado; `pnpm build` pasaba igual porque `desktop` sí la tenía, pero el IDE y `tsc --noEmit` en `ui` no resolvían el módulo.
