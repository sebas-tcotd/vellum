# Packaging and installers

- [Español](../es/packaging-and-installers.md)
- [Back to the English index](index.md)

Vellum is distributed by download, not through a store. Nobody vets the
package before a user sees it, so the installer is the first thing that has to
look like it came from somewhere. This is what each platform actually ships,
how much of it can be customised, and where the line falls between what CI
verifies and what a person has to open.

## What a release produces

| Platform | Artifact                       | Where the identity shows up                                                               | Signing today                                           |
| -------- | ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Windows  | `.msi` (WiX) — **recommended** | Publisher in Add/Remove Programs, banner and dialog artwork, the opt-in `.cslmap` dialog. | Authenticode **only when a certificate is configured**. |
| Windows  | `.exe` (NSIS)                  | Header and sidebar artwork, installer icon, per-user install, language selector.          | Same certificate, same conditional.                     |
| macOS    | `.dmg`                         | The volume window: background, window size, app and Applications positions.               | **Never signed or notarised.** The gate stays `false`.  |
| Linux    | `.deb`, `.rpm`                 | The `.desktop` entry: name, comment, icon, category.                                      | No equivalent publisher signature exists for these.     |
| Linux    | `.AppImage`                    | Nothing beyond the embedded icon and binary name.                                         | Same.                                                   |

`finalize-release` hard-requires only the `.msi`, the `.dmg`, the `.AppImage`
and `latest.json`; the `.exe`, the `.deb` and the `.rpm` are enforced later and
incidentally, when the release body looks for an asset matching each extension.
So one of those three going missing fails late rather than at the gate — worth
knowing before reading a green preflight as proof all six shipped. Unsigned
builds keep the warning that Story 1.8 put in the release
notes and in `signing-evidence.md` — installer artwork does not soften it, and
a prettier installer is not evidence of provenance.

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

**Windows / NSIS (EXE).** A 150×57 header bitmap, a 164×314 sidebar bitmap, an
installer `.ico`, the language list and the language selector. NSIS installs
per user (`installMode: "currentUser"`): Vellum writes inside its install
prefix and the user's own data directories, so asking for administrator rights
would buy a UAC prompt and nothing else. The MSI stays per machine, which is
what anyone deploying an MSI expects.

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

- **`.cslmap` is a Windows-only, opt-in association on all three platforms.**
  The `.desktop` entry declares no `MimeType`: nothing in the `.deb` or `.rpm`
  installs a shared-mime-info definition for `*.cslmap`, and doing so would need
  a maintainer script this story rules out — so the line would match nothing
  while looking verified.
- **The app icons are not regenerated by any of this.** `src-tauri/icons/` —
  the `.ico`, the `.icns`, the PNG set and the Icon Composer `Assets.car` —
  were committed without a reproducible source, and `icons/iconcomposer/README.md`
  documents a manual Xcode process. They are untouched here; `brand/` covers
  installer artwork only.

## Why there are no installation scripts

No `preInstallScript`, `postInstallScript`, `preRemoveScript`,
`postRemoveScript` or NSIS `installerHooks` anywhere, and `check:installer`
fails if one appears. An installer that runs code runs it with whatever
privileges the install had, and it is the part of a package nobody reads. Vellum
needs none of it: it copies files into its install prefix, and the one thing it
registers — the opt-in `.cslmap` association — is declarative WiX registry
entries that the MSI removes on uninstall.

Nothing outside the install prefix is modified, and no dependency that installs
third-party software is declared. Uninstalling removes the application and the
association; maps, third-party themes and preferences live in the user's own
data directories and survive.
