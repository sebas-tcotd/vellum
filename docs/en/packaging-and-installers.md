# Packaging and installers

- [Español](../es/packaging-and-installers.md)
- [Back to the English index](index.md)

Vellum publishes standalone downloads and produces a separate MSIX package for
Microsoft Store submission. Publishing the MSIX on GitHub does not certify it
or make it directly installable; Store distribution requires Microsoft's
certification and signing. See [MSIX packaging](msix.md) for the submission and
validation checklist. This page describes the artifacts, their identity, and
what CI verifies versus what a person must check.

## What a release produces

| Platform | Artifact                        | Where the identity shows up                                                 | Signing today                                                           |
| -------- | ------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Windows  | `.exe` (NSIS) — **recommended** | One-click per-user installation, progress, and a final Vellum launch.       | Currently unsigned; Authenticode only when a certificate is configured. |
| Windows  | `.msi` (WiX) — alternative      | Publisher in Add/Remove Programs, banner, and opt-in `.cslmap` dialog.      | Same conditional.                                                       |
| Windows  | `.msix` — Store submission      | Package identity, logos, and `.cslmap` / `.vellummap` associations.         | Unsigned submission; Microsoft signs the certified Store package.       |
| macOS    | `.dmg`                          | The volume window: background, window size, app and Applications positions. | **Never signed or notarised.** The gate stays `false`.                  |
| Linux    | `.deb`, `.rpm`                  | The `.desktop` entry: name, comment, icon, category.                        | No equivalent publisher signature exists for these.                     |
| Linux    | `.AppImage`                     | Nothing beyond the embedded icon and binary name.                           | Same.                                                                   |

`finalize-release` requires the NSIS `.exe`, `.msi`, `.msix`, `.dmg`, `.AppImage`, and
`latest.json`. The MSIX is excluded from the Tauri updater; Store manages updates
for that edition. Updater signatures do not imply Authenticode signing of the
standalone installer. The generic Windows updater key (`windows-x86_64`) resolves to
the EXE; explicit MSI and NSIS keys remain for existing installations. Unsigned
builds keep the warning that Story 1.8 put in the release
notes and in `signing-evidence.md` — installer artwork does not soften it, and
a prettier installer is not evidence of provenance.

The exact `v1.0.0` tag is held as a GitHub draft after all release gates pass so
its MSIX can be submitted to Microsoft Store certification without making the
release assets public. The tag and source commit remain public. After Microsoft
approves the package, publish that same GitHub draft; do not rebuild or replace
the reviewed MSIX. Later tags continue to publish automatically.
Because the tag and source are public, their source archive is public too. While
`v1.0.0` remains a draft, the updater's `releases/latest` endpoint continues to
serve the newest published release; a later tag can become latest before Store
certification is complete.

**Two MSIs, one per language.** `bundle.windows.wix.language` lists `en-US` and
`es-ES`, and WiX builds a separate MSI per locale. Both are published; the
release body links the first one it finds. This is the cost of the `.cslmap`
dialog, whose own strings are Spanish, no longer sitting on top of an
English-only base UI.

## Where the identity comes from

Every visible string and every pixel is derived from one versioned source:

```
brand/installer-copy.json ── pnpm brand:build ──→ apps/desktop/src-tauri/installer/*.bmp, *.png
brand/vellum-mark.svg    ──┘        └─ by hand ─→ tauri.conf.json, linux/vellum.desktop
```

Nothing in `apps/desktop/src-tauri/installer/` is edited in place, and no
installer text is written anywhere but `brand/installer-copy.json`. See
[`brand/README.md`](../../brand/README.md) for the workflow. `pnpm
check:installer` fails if a derived file is missing, mis-sized, retouched, or
generated from a different `brand/` than the one committed. The comparison is by
content hash, not by timestamp: touching a file changes nothing, and editing one
byte of either side is caught.

## What is actually customisable

Less than the marketing screenshots of installer tooling suggest.

**Windows / WiX (MSI).** Two bitmaps, both mandatory sizes: the banner at
493×58 (drawn on every page but the first, with the page title on its left) and
the dialog image at 493×312 (the welcome and completion pages, where only the
leftmost 164px stays uncovered by text). Both must be 24-bit BMP; a bitmap with
an alpha channel renders as a black rectangle. The dialog _sequence_ is
extensible only through WiX fragments — which is exactly how the opt-in
`.cslmap` checkbox exists.

**Windows / NSIS (EXE).** This is the public installer. Its versioned template
is based on Tauri 2.10.3 and reduces the flow to Vellum identity, **Install
Vellum**, progress, and **Open Vellum**. It retains Tauri's `/S`, update, and
uninstall behavior, and installs per user (`installMode: "currentUser"`) without
UAC. MSI remains the managed-deployment alternative; its `.cslmap` opt-in is not
automatically replicated in NSIS.

**macOS / DMG.** A background image, the window size, and the position of the
app and of the Applications alias. That is the entire surface — there is no
installer flow, only a window with two icons and an arrow between them.

**Linux.** No installer UI exists at all. `dpkg -i` and `dnf install` show
nothing. The `.desktop` entry shared by the `.deb` and the `.rpm` _is_ the
identity: name, localised comment, icon, `Graphics;Education;` categories and
the `.cslmap` MIME type.

## Why no installer asks you to accept a licence

`bundle.license` is `"MIT"` — it fills the MSI, `.deb` and `.rpm` metadata
fields — but `bundle.licenseFile` is deliberately absent, and
`check:installer` fails if it comes back. Declaring it would make `hdiutil`
embed the LICENSE as a software licence agreement, so the MIT text would have
to be accepted before the DMG volume even mounts, and the window that explains
dragging Vellum to Applications is what the user should meet first. The same
key gives the MSI a licence page nobody reads. MIT is permissive: using Vellum
requires no acceptance, so no installer asks for one.

## Known limits

- **DMG icon positions are unreliable in CI.** Tauri's DMG bundler drives
  Finder through AppleScript to place icons and set the background. On a
  headless GitHub runner with no logged-in window server that step is flaky and
  can be skipped silently, leaving a DMG whose window falls back to the Finder
  default while the build still reports success. The configured layout is
  therefore verified by opening the DMG on a real Mac, and the row for it lives
  in the [release verification matrix](release-verification-matrix.md).
- **The DMG is no longer reopened after the build.** An earlier step converted
  it to read/write, copied a readme inside and repacked it. A file added after
  the bundler placed the icons has no position of its own, so it landed on top
  of the layout — and repacking would have invalidated a signature had there
  been one. The install guide lives in the release body — drag to Applications,
  plus the Gatekeeper note — and the `xattr -cr` escape hatch in the
  [README](../../README.md); both are read before downloading rather than after
  mounting.
- **CI never runs the rasteriser.** `pnpm brand:build` is run by hand and its
  output is committed, so no runner rasterises anything on the release path.
  `@resvg/resvg-js` _is_ installed on every runner — it is a root
  devDependency, so `pnpm install` pulls it — but nothing in CI invokes it. It
  is pinned to an exact version rather than a caret range, because the guardrail
  compares output hashes and a minor bump would read as artwork retouched by
  hand.

- **The standalone MSI's `.cslmap` association is Windows-only and opt-in.**
  The MSIX declares `.cslmap` and `.vellummap` associations in its package
  manifest; they are not the MSI checkbox.
  The `.desktop` entry declares no `MimeType`: nothing in the `.deb` or `.rpm`
  installs a shared-mime-info definition for `*.cslmap`, and doing so would need
  a maintainer script this story rules out — so the line would match nothing
  while looking verified.
- **The macOS and Linux app icons are not regenerated by any of this.**
  `src-tauri/icons/` — the `.icns`, the PNG set and the Icon Composer
  `Assets.car` — were committed without a reproducible source, and
  `icons/iconcomposer/README.md` documents a manual Xcode process. The
  **Windows** icon is: `pnpm icons:windows` derives `icons/windows/` (the `.ico`
  and the MSIX logos) from `brand/windows-app-icon.svg`, and `check:installer`
  verifies it. See [`brand/README.md`](../../brand/README.md).

## Why there are no installation scripts

No `preInstallScript`, `postInstallScript`, `preRemoveScript`,
`postRemoveScript` or NSIS `installerHooks` anywhere, and `check:installer`
fails if one appears. An installer that runs code runs it with whatever
privileges the install had, and it is the part of a package nobody reads. Vellum
needs none of it: standalone installers copy files into their install prefix.
The MSI's opt-in `.cslmap` association uses declarative WiX registry entries
that the MSI removes on uninstall. MSIX associations are declared in the
package manifest and managed by Windows.

No dependency that installs third-party software is declared. Standalone
uninstall removes the application and its registered association; maps,
third-party themes and preferences remain in the user's data directories.
The Store edition uses separate package storage, which can be removed on
uninstall: back up custom themes first (see [MSIX packaging](msix.md)). Maps
exported outside the package remain ordinary files.

Vellum's NSIS template is not a hook: it is reviewed packaging code. The
guardrail checks that it retains per-user install, `/S`, updating, uninstall,
and final launch. Its maintenance cost and decision are recorded in
[ADR 0002](../adr/0002-nsis-public-windows-installer.md).
