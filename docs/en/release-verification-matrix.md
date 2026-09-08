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

| Check                                      | Where                    | What it proves                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Golden flow (open → ready → export)        | Linux CI                 | The compiled binary opens a `.cslmap` passed in argv, renders it, and the real `ExportDialog` writes the announced PNG.                                                                        |
| Export cancellation                        | Linux CI                 | A cancelled export publishes no file and leaves no orphan `.vellum-export-*.part`.                                                                                                             |
| Surface and shell visual regression        | Linux CI                 | The rendered map and the shell chrome match committed baselines within the export goldens' versioned threshold.                                                                                |
| Shell profiles (`windows`/`macos`/`linux`) | Linux CI                 | Each profile's token set produces a visibly distinct shell.                                                                                                                                    |
| Compile check                              | Windows, macOS, Linux CI | The Rust shell still compiles on all three targets (`compile-matrix` in `ci.yml`).                                                                                                             |
| Bundle and updater manifest                | Windows, macOS, Linux CI | Installers build, their updater artifacts are signed, and the published `latest.json` resolves and validates (`publish-release.yml`).                                                          |
| Windows Authenticode signature             | Windows CI               | **Only when a certificate is configured.** With one, the MSI signature is verified and an invalid one fails the release. Without one, the release still publishes and the absence is recorded. |
| Signing evidence asset                     | Linux CI                 | Every release carries `signing-evidence.md` stating, per platform, whether the installer is code-signed and whether its updater artifact is (`publish-release.yml`).                           |
| Network surface guardrail                  | Linux CI                 | `pnpm check:network` — no browser networking in production code, no HTTP crates, CSP and capabilities unchanged. Blocking.                                                                     |
| Installer identity guardrail               | Linux CI                 | `pnpm check:installer` — metadata against `brand/`, derived artwork present and correctly sized, the opt-in `.cslmap` association intact, and no installation scripts. Blocking.               |
| Dependency audit                           | Linux CI                 | `pnpm audit:deps` reports JavaScript and Rust advisories. **Informative — never blocks.**                                                                                                      |

The suite drives the **compiled release binary** through `tauri-driver` plus
`webdriverio` used as a library, so it exercises the real WebView, the real IPC
boundary and the real export pipeline. It never points a separate browser at the
Vite dev URL — that was the previous Playwright setup, and it verified the
frontend in Chromium while proving nothing about the application.

Note what the signing rows do **not** claim. macOS is never code-signed today:
`tauri.conf.json` declares no `signingIdentity`. (The pipeline no longer
repackages the DMG after the build — that step was removed in Story 1.9 — so
that second reason is gone; the absent signature remains deliberate.) Windows is
signed only when a certificate is configured. Neither absence blocks a release —
both are recorded in the `signing-evidence.md` asset and warned about in the
release notes. The reasoning is in
[Security and privacy](security-and-privacy.md), and what each installer can and
cannot be made to look like is in
[Packaging and installers](packaging-and-installers.md).

## What stays manual

| Platform                | Why it is not automated                                                                                                                                                                                            | What a human checks                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS                   | Tauri v2 ships **no WebDriver implementation for WKWebView**. There is no driver to run, so a macOS runner cannot be driven at all — simulating it would be theatre.                                               | Open a `.cslmap` from Finder, export, and confirm the window chrome, vibrancy and menu behaviour.                                                                                                                                                                                 |
| Windows                 | `tauri-driver` can drive WebView2 via `msedgedriver`, but a Windows runner is not part of this gate yet (extending it is a deliberate, separate decision).                                                         | Same journey, plus the `.cslmap` file association the MSI installs.                                                                                                                                                                                                               |
| macOS — DMG             | The DMG bundler places icons and the background by driving Finder over AppleScript. On a headless runner that is flaky and can be skipped silently: the build reports success with the window on Finder's default. | Mount the `.dmg`, confirm the Vellum background, the window size and the app / Applications alias positions, and that no loose readme file appears.                                                                                                                               |
| Windows — clean install | No CI runner actually installs: verifying an MSI needs a clean machine, and SmartScreen reputation depends on install-base telemetry no runner produces.                                                           | Install the MSI: Vellum's publisher, icon, banner and copy; the `.cslmap` checkbox unticked by default; uninstall and confirm the association is gone and that maps, themes and preferences survive. Repeat the journey with the NSIS `.exe` (no association — that is MSI-only). |
| Linux — clean install   | A `dpkg -i` in a container has no desktop environment, and what has to be seen is exactly what the launcher draws.                                                                                                 | Install the `.deb` and the `.rpm` on a real desktop and search for Vellum in the launcher: icon, name, comment in the system language, category. Uninstall and confirm maps, themes and preferences survive.                                                                      |

### The CSP smoke check

The golden flow exercises the Content-Security-Policy only on Linux, under
WebKitGTK. The two directives most likely to differ between engines —
`worker-src`/`child-src` with `blob:`, which MapLibre's worker pool depends on —
are exactly the ones a single engine cannot vouch for: WebView2 (Windows) and
WKWebView (macOS) implement them differently, and WebKit has historically not
honoured `worker-src` at all. So on a release candidate, on **each** of Windows
and macOS, with the WebView console open:

1. Open a large `.cslmap` and confirm the map renders rather than staying blank
   — a blank map is the signature of a blocked worker.
2. Open the layer panel and any dialog (Preferences, About) — a broken
   `style-src` shows as unstyled or invisible modal content.
3. Export a PNG and export an SVG — both paths touch a worker, a `blob:` and a
   `data:` URI at once.
4. Confirm the console reports **no** CSP violation.

A violation is a policy bug, not a reason to relax the policy to `'unsafe-eval'`:
find the directive the evidence actually demands and record it in
[Security and privacy](security-and-privacy.md).

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
