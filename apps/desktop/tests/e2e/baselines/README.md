# Golden-flow visual baselines

Reference captures for `apps/desktop/tests/e2e/visual-regression.test.mjs`.
Each file is a full-window PNG taken over WebDriver from the **compiled release
binary**, with `packages/parser-cslmap/fixtures/altavento.cslmap` loaded and the
map reporting `data-map-state="ready"`.

## What each baseline captures

| File                | Subject                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `shell-linux.png`   | Neutral profile (`data-platform="linux"`): the default shell tokens. |
| `shell-windows.png` | Fluent 2 profile (`data-platform="windows"`).                        |
| `shell-macos.png`   | Liquid Glass profile (`data-platform="macos"`).                      |

A capture is one window, so each file covers **both** subjects at once: the
rendered map surface (the cartographic regression) and the shell chrome around
it (the profile regression). They are not two separate sets of images because
they are not two separate captures.

`*.actual.png` files are written next to a baseline when a comparison fails, so
the difference can be looked at rather than only read about. They are scratch
output and are git-ignored — never commit one, and never rename one into place
as a baseline.

## The comparison and its threshold

The comparator is the one the export goldens already use —
`compareRgbaPixels` and `decodePngToRgba` from
`packages/renderer-webgl/test/export-goldens`. The threshold is not redeclared
here: it is read from that suite's `manifest.json`
(`harness.comparison`: `rgbChannelDeltaExclusive: 2`,
`maxDifferentPixelRatio: 0.005`, `alpha: exact`) and the test asserts the
manifest still agrees with the harness constant. Changing the tolerance is a
single reviewed edit to that manifest, not a number that can drift apart in two
places.

## What a green baseline does and does not prove

These are captured on Linux, under `tauri-driver` + `WebKitWebDriver`. The
macOS profile is exercised by overriding `data-platform` on `<html>`, which
`PlatformContext` sets in a layout effect keyed by `platform` — so the override
survives, and no relaunch is needed per profile.

That means `shell-macos.png` verifies the **Liquid Glass token set**: the radii,
materials, alphas and typography the profile declares. It does **not** verify
macOS's native vibrancy materials, its window chrome, or anything WKWebView
renders differently from WebKitGTK. Tauri v2 ships no WebDriver for WKWebView,
so a macOS runner cannot be driven at all; the macOS column of the release
matrix stays a manual check. See `docs/en/release-verification-matrix.md`.

## Regenerating a baseline

Regeneration is deliberate, never automatic. A missing baseline fails the test
asking for it; nothing is ever written silently.

**Generate them on CI, not on your machine.** These are full-window captures
compared at 0.5% differing pixels, and font antialiasing alone differs enough
between two Linux installs to blow past that. A baseline is only valid in the
image that later compares it — the `ubuntu-22.04` runner, which is not a clean
`ubuntu:22.04` container either.

So: run the **E2E Golden Flow** workflow manually (Actions → E2E Golden Flow →
Run workflow) with `update_baselines` checked. Download the
`golden-flow-captures` artifact, review the three PNGs, and commit them here.

That run **always fails**. That is the point: a run that writes baselines can
never also be the run that approves them, so a regenerated image is always a
diff someone looked at in a pull request.

Locally the same flag works, and is useful for seeing what the capture _looks_
like while developing — but the output will not match CI, so never commit it:

```bash
pnpm --filter @vellum/desktop exec tauri build --no-bundle
VELLUM_E2E_UPDATE_BASELINES=1 xvfb-run -a --server-args="-screen 0 1920x1080x24" pnpm test:e2e
```

Before committing a regenerated baseline, say in the PR **why** it changed. A
baseline updated without a stated reason converts every future regression in
that area into a green build.
