# Release verification matrix

- [Español](../es/release-verification-matrix.md)
- [Back to the English index](index.md)

What is verified automatically before a release can be published, what stays a
human check, and why the line falls where it does.

## The gate

[`e2e-golden-flow.yml`](../../.github/workflows/e2e-golden-flow.yml) is a
reusable workflow called from two places:

- [`ci.yml`](../../.github/workflows/ci.yml) — every pull request and every push
  to `main`.
- [`publish-release.yml`](../../.github/workflows/publish-release.yml) — on a
  `v*` tag, before any platform starts building and again as a prerequisite of
  the publish step.

It is blocking, not informative. If the golden flow fails, `build-release` never
starts and `finalize-release` never flips the draft to published.

The workflow is invoked twice on purpose. A tag can point at a commit that never
went through `ci.yml`, so the evidence is produced against the artifact that is
actually about to ship rather than against a promise made earlier.

## What runs automatically

| Check                                      | Where                    | What it proves                                                                                                          |
| ------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Golden flow (open → ready → export)        | Linux CI                 | The compiled binary opens a `.cslmap` passed in argv, renders it, and the real `ExportDialog` writes the announced PNG. |
| Export cancellation                        | Linux CI                 | A cancelled export publishes no file and leaves no orphan `.vellum-export-*.part`.                                      |
| Surface and shell visual regression        | Linux CI                 | The rendered map and the shell chrome match committed baselines within the export goldens' versioned threshold.         |
| Shell profiles (`windows`/`macos`/`linux`) | Linux CI                 | Each profile's token set produces a visibly distinct shell.                                                             |
| Compile check                              | Windows, macOS, Linux CI | The Rust shell still compiles on all three targets (`compile-matrix` in `ci.yml`).                                      |
| Bundle, signing and updater manifest       | Windows, macOS, Linux CI | Installers build, are signed, and the updater manifest resolves (`publish-release.yml`).                                |

The suite drives the **compiled release binary** through `tauri-driver` plus
`webdriverio` used as a library, so it exercises the real WebView, the real IPC
boundary and the real export pipeline. It never points a separate browser at the
Vite dev URL — that was the previous Playwright setup, and it verified the
frontend in Chromium while proving nothing about the application.

## What stays manual

| Platform | Why it is not automated                                                                                                                                              | What a human checks                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| macOS    | Tauri v2 ships **no WebDriver implementation for WKWebView**. There is no driver to run, so a macOS runner cannot be driven at all — simulating it would be theatre. | Open a `.cslmap` from Finder, export, and confirm the window chrome, vibrancy and menu behaviour. |
| Windows  | `tauri-driver` can drive WebView2 via `msedgedriver`, but a Windows runner is not part of this gate yet (extending it is a deliberate, separate decision).           | Same journey, plus the `.cslmap` file association the MSI installs.                               |

The three shell profiles are still covered on Linux, because they are selected
by `data-platform` on `<html>` rather than by the host OS. That verifies the
**token sets** — Fluent 2, Liquid Glass, neutral — and not the native materials
either OS actually composites. A green `shell-macos.png` says the Liquid Glass
tokens applied; it does not say macOS looked right. That distinction is repeated
in [the baselines README](../../apps/desktop/tests/e2e/baselines/README.md) so a
green baseline is never read as more than it is.

## Running the golden flow locally

```bash
cargo install tauri-driver --locked     # once
pnpm --filter @vellum/desktop exec tauri build --no-bundle     # the release binary under test
pnpm test:e2e
```

On Linux you also need `webkit2gtk-driver` (which provides `WebKitWebDriver`)
and, on a headless machine, `xvfb-run`. On macOS the suite cannot run at all,
for the reason above.

The run redirects the app's Downloads directory (`XDG_DOWNLOAD_DIR` and `HOME`)
into a throwaway temp tree, so nothing it exports reaches the real Downloads
folder, and the temp tree plus the `tauri-driver` process are torn down whether
the run passes or fails.

`pnpm test` does **not** run any of this: the unit suites stay hermetic and never
start the app. The golden flow is a separate command with separate prerequisites.
