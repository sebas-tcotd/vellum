# Contributing to Vellum

Thanks for considering a contribution. Vellum is currently maintained by a single person, so please open an issue before starting anything beyond a small, obvious fix — it saves everyone time if the direction gets discussed first.

## Getting started

### Requirements

| Tool      | Version                             |
| --------- | ----------------------------------- |
| Node.js   | 20                                  |
| pnpm      | `10.33.0`                           |
| Rust      | `1.96.0` from `rust-toolchain.toml` |
| Tauri CLI | `2.x`                               |

Install the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS first — WebKitGTK and build tools on Linux, Xcode Command Line Tools on macOS, Microsoft C++ Build Tools plus WebView2 on Windows. pnpm does not install these for you.

### Clone and run

```bash
git clone https://github.com/sebas-tcotd/vellum.git
cd vellum
pnpm install          # or `pnpm approve-builds` first if esbuild's postinstall is blocked
pnpm dev               # opens the native Tauri window
```

You don't need Cities: Skylines or your own save to try changes — real `.cslmap` fixtures are checked in under [`packages/parser-cslmap/fixtures`](packages/parser-cslmap/fixtures), drag one onto the running app.

### Running tests and checks

```bash
pnpm lint                  # tsc --noEmit across all packages
pnpm check:architecture    # enforce cross-package import rules
pnpm test                  # all TS test suites (Vitest)
pnpm format                # prettier --write

cargo fmt --all -- --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
```

Run a single package's tests with `pnpm --filter @vellum/<package> test`.

## Making a change

1. Fork the repo and create a branch off `main`.
2. Keep the change focused — a bug fix shouldn't carry an unrelated refactor.
3. Follow the architecture and coding rules documented in [`docs/`](docs): the monorepo's package dependency graph is one-directional and enforced by `pnpm check:architecture`, TypeScript is strict (`any` is not allowed), and Rust production code never uses `unwrap()`/`expect()`.
4. If you touch `packages/core/src/ipc-contract.ts`, update the matching Rust side (`apps/desktop/src-tauri`) in the same commit — they must stay in sync.
5. Add or update tests for the behavior you changed.
6. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, `docs:`, ...) — this is enforced by commitlint on commit.

## Opening a pull request

- Make sure `pnpm lint`, `pnpm test`, `pnpm check:architecture` and the Rust checks above all pass locally — CI runs the same checks.
- Fill in the PR template: what changed, why, and how you tested it.
- If your change touches user-facing strings, update both locales (English and Spanish) — see the i18n setup under `packages/ui/src/i18n`.
- Small PRs get reviewed faster than large ones.

## Reporting bugs

Open a [GitHub issue](https://github.com/sebas-tcotd/vellum/issues) with steps to reproduce, what you expected, and what happened instead. A sample `.cslmap` file that triggers the issue is extremely helpful if the bug is parser- or render-related.

For security vulnerabilities, do **not** open a public issue — see [`SECURITY.md`](SECURITY.md) instead.
