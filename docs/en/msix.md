# Microsoft Store MSIX

The Windows release job packages the existing x64 standalone executable from the
same commit and Tauri version. It does not rebuild per channel. The Store identity
is `SebastianVargasPizango.VellumCityMaps`, with publisher
`CN=F93C1C62-364D-4C65-83BA-6DDD8A04B97F`, display name **Vellum City Maps**, and
publisher display name **Sebastian Vargas Pizango**. The standalone Tauri publisher
is unchanged. Minimum Windows version is `10.0.17763.0`.

After compiling the release executable, run from the repository root:

```powershell
./scripts/package-msix.ps1 -Executable target/x86_64-pc-windows-msvc/release/vellum.exe
```

The script discovers installed x64 Windows SDK `makepri` and `makeappx` tools. Use
`-SdkBin` to select their directory. `-Version X.Y.Z` must equal the stable Tauri
version; components must fit 0–65535. The executable must declare product name
`Vellum` and the same embedded product version. The MSIX version is `X.Y.Z.0`. The optional
`-OutputDirectory` must be inside this repository's `target` directory and cannot
contain the input executable or traverse a junction. No input is deleted. A fresh
staging directory is retained for inspection on every run; output is
`target/msix/VellumCityMaps_X.Y.Z.0_x64.msix` by default.

The package contains the unchanged executable, all declared Tauri resources,
built-in themes, existing logos, manifest and generated PRI. Both `.cslmap` and
`.vellummap` associations pass the file path as `"%1"`. No installer bootstrap is
included. The script unpacks the package and checks the executable SHA256 and
absence of a package signature before reporting success.

The uploaded MSIX is unsigned, intended for Microsoft signing and certification.
It is not a directly installable public download and is excluded from the Tauri
updater. No local certificate is created, trusted or used. CI requires the MSIX
asset before publishing the GitHub draft; this does not submit to Partner Center.

When packaged, Vellum disables its updater; Store handles updates. Preferences,
WebView2 profile and custom themes use package-specific Windows storage, separate
from a standalone installation. No automatic migration is promised. Back up custom
themes before uninstalling: package data can be removed. Exports saved outside
package storage remain normal files. Built-in themes live in the read-only package.

## Pending pre-submission validation

These checks are pending for the final release package and definitive v1.0 sample.
The earlier spike is not evidence that this package passed them. Record package
hash, commit, Windows version, sample and results for each check:

- [x] Inspect with SDK unpack (see the log below): Store identity, `X.Y.Z.0`, x64, minimum Windows,
      quoted associations, logos, runtime resources, unchanged executable hash and
      no `AppxSignature.p7x` in the unsigned submission.
- [ ] Obtain Microsoft certification/signing; do not treat the GitHub upload as
      certification or claim a Store installation before it happens.
- [ ] Install the Store-delivered package on clean Windows 10 and Windows 11;
      verify missing WebView2 guidance where applicable, then launch offline.
- [ ] Double-click both `.cslmap` and `.vellummap`, including paths with spaces
      and non-ASCII characters, using the definitive sample; verify correct map.
- [ ] Verify no application network requests offline, and no standalone updater.
- [ ] Export PNG and SVG; inspect files and destination folders.
- [ ] Check every built-in theme and save/load a custom theme; verify separation
      from standalone preferences and themes.
- [ ] Uninstall; check package data removal, preserved external exports, and
      removal of package file associations without damaging the standalone app.

## Validation log

### 2026-10-06 — package inspection and local smoke test

Commit `09ea4c0`, version 0.14.0, Windows 11 (10.0.26200), SDK 10.0.26100.0,
package `VellumCityMaps_0.14.0.0_x64.msix`, Costa Tijuca sample. This is an
inspection of the unpacked package plus a run of the loose executable; it does
not replace clean-Windows validation or Store certification.

| Check                                        | Result                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SDK unpack: manifest                         | Correct: Store identity, `0.14.0.0`, x64, minimum `10.0.17763.0`, quoted `"%1"` associations, logos and `resources.pri`.                                                                   |
| Packaged exe hash                            | `BA532CF931B0DD1DFC8A4B9A6D700FD763FC9C21DBB64970405C32C1F9A7EE01`, equal to the input exe.                                                                                                |
| `AppxSignature.p7x`                          | Absent, as expected for the unsigned submission.                                                                                                                                           |
| Bundled sample                               | SHA-256 `8B1AC9D4…FBEB3` inside the package; `cargo test --package vellum --test sample_city` passes.                                                                                      |
| `pnpm check:network`, `pnpm check:installer` | Pass.                                                                                                                                                                                      |
| Open `.vellummap` via argv                   | Map loads and renders with a path containing spaces and non-ASCII characters. The loose exe was run, not the installed package.                                                            |
| Loose-exe network, 12 s after launch         | Two HTTPS connections to `52.97.x.x:443`, both owned by `msedgewebview2.exe` (the WebView2 runtime), none by `vellum.exe`. Inconclusive: repeat with the installed MSIX.                   |
| `scripts/package-msix.test.mjs`              | With PowerShell 7, 15 of 16 pass. "rejects absent and non-PE input" fails because it matches the English message ("does not exist") and this Windows is Spanish; it does not happen in CI. |

Everything else on the list remains pending: Store install on clean Windows 10
and 11, double-click from Explorer with the installed package, installed-package
network offline with the updater disabled, PNG/SVG, themes, uninstall and
Microsoft certification.
