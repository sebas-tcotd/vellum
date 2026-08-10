# Vellum — Development guide

This guide covers local setup, development commands, checks and the workflows
that matter when changing the monorepo. For PR conventions and the contribution
checklist, see [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## Prerequisites

| Tool      | Version                             | Check with             |
| --------- | ----------------------------------- | ---------------------- |
| Node.js   | 20                                  | `node --version`       |
| pnpm      | `10.33.0`                           | `pnpm --version`       |
| Rust      | `1.96.0` from `rust-toolchain.toml` | `rustc --version`      |
| Tauri CLI | `2.x`                               | `pnpm tauri --version` |

Install the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)
before running `pnpm install`: WebKitGTK and build tools on Linux, Xcode Command
Line Tools on macOS, and Microsoft C++ Build Tools plus WebView2 on Windows.
pnpm does not install these native dependencies.

## Setup

```bash
git clone https://github.com/sebas-tcotd/vellum.git
cd vellum
pnpm install
```

If esbuild's postinstall is blocked, run `pnpm approve-builds` when pnpm asks for
approval and then install again. You do not need Cities: Skylines or your own save
to try the app: real `.cslmap` fixtures live in
[`packages/parser-cslmap/fixtures`](../../packages/parser-cslmap/fixtures).

## Development mode

```bash
pnpm dev                          # Vite + Tauri; opens the native window
cd apps/desktop && pnpm dev:vite  # frontend only, without the Tauri process
```

The Vite development server uses port `1420`; Tauri's hot-reload path uses port
`1421`.

## Build

```bash
pnpm build
```

Turborepo builds packages in dependency order: `core` → `theme-engine` and
`parser-cslmap` → the renderers → `ui` → `desktop`.

To remove stale build output before rebuilding:

```bash
rm -rf .turbo apps/desktop/dist packages/*/dist
find . -name "tsconfig.tsbuildinfo" -delete
pnpm build
```

## Lint and architecture checks

```bash
pnpm lint                  # TypeScript checks and package lint tasks
pnpm check:architecture    # enforces the one-way package dependency graph
pnpm format                # writes Prettier formatting
pnpm format:check          # checks formatting, as CI does
```

The architecture check is not cosmetic. A package may import another package
only along the allowed dependency graph; use package barrels rather than another
package's internal source paths.

## Tests

```bash
pnpm test
pnpm --filter @vellum/<pkg> test
pnpm --filter @vellum/ui test -- MapLibreRoot.test.tsx

cargo fmt --all -- --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
```

The TypeScript suites run through Turborepo and Vitest. Rust tests cover the
parser and the native export pipeline. Playwright is configured under
`apps/desktop/tests/e2e`:

```bash
pnpm test:e2e
```

The E2E command requires a built desktop app, `tauri-driver` and a compatible
display environment. It is available for local validation but is not part of the
default CI job yet.

## CI and releases

| Workflow                                                             | Trigger                        | Purpose                                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ci.yml`](../../.github/workflows/ci.yml)                           | Push or pull request to `main` | Formatting, TypeScript, architecture, Vitest, Rust checks and platform compile checks.                                                       |
| [`landing-ci.yml`](../../.github/workflows/landing-ci.yml)           | Landing PRs or manual run      | Type-checks/lints and builds `@vellum/landing`.                                                                                              |
| [`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml)       | Landing changes on `main`      | Builds and deploys the landing page to GitHub Pages, then checks the deployed HTML and assets.                                               |
| [`release-please.yml`](../../.github/workflows/release-please.yml)   | Push to `main`                 | Creates or updates the Release Please PR used to prepare versioned releases.                                                                 |
| [`publish-release.yml`](../../.github/workflows/publish-release.yml) | Tag `v*`                       | Builds Windows `.msi`, macOS `.dmg` and Linux `.AppImage` bundles, signs the updater artifacts and publishes the release after verification. |

Use `pnpm release:verify` to check release and updater configuration locally. It
does not publish anything.

## Adding an IPC command

The TypeScript and Rust sides of the IPC contract must change together.

1. Define the command and its payload/result types in
   `packages/core/src/ipc-contract.ts`.
2. Implement the matching `#[tauri::command]` in
   `apps/desktop/src-tauri/src/commands.rs`, including a `///` doc comment and
   an `# Errors` section when relevant.
3. Register the command in `invoke_handler!()` inside `lib.rs`.
4. Add tests for the behavior and run the architecture, TypeScript and Rust
   checks.

The [integration architecture](integration-architecture.md) documents the
current command and event inventory.

## Adding a package

1. Create `packages/<name>/package.json` with the name
   `@vellum/<name>`.
2. Add a composite `tsconfig.json` and a public `src/index.ts` barrel.
3. Add the path alias to the root TypeScript configuration.
4. Add the workspace dependency and a TypeScript project reference in each
   consumer.
5. Run `pnpm install`, build the package, and verify it with `pnpm lint`.

Both the package dependency and the TypeScript project reference matter. Missing
the latter can leave the build apparently healthy while the consuming package's
IDE and `tsc --noEmit` cannot resolve the module.
