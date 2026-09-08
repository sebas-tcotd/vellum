# Security and privacy posture

- [Español](../es/security-and-privacy.md)
- [Back to the English index](index.md)

What Vellum locks down, what it deliberately leaves open, and where the
evidence for each claim lives. Four guarantees: a real Content Security Policy,
an audited dependency tree, a signing story that is honest rather than
convenient, and a network surface that is frozen instead of merely observed.

## 1. Content Security Policy

The policy is written once, in
[`apps/desktop/src-tauri/tauri.conf.json`](../../apps/desktop/src-tauri/tauri.conf.json)
under `app.security.csp`. Tauri extends it at build time with its own script
nonces and the `ipc: http://ipc.localhost` origin — those are never written by
hand.

```
default-src 'self';
script-src 'self' blob:;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' data:;
worker-src 'self' blob:;
child-src 'self' blob:;
object-src 'none';
frame-src 'none';
base-uri 'self';
form-action 'none'
```

Every permissive directive is forced by something the app actually loads. None
of them is a precaution:

| Directive                          | What forces it                                                                                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worker-src 'self' blob:`          | MapLibre builds its worker pool from `URL.createObjectURL(new Blob(...))` (`packages/renderer-webgl/src/map-libre-renderer.ts`). `'self'` additionally covers the module worker the SVG export route creates in `apps/desktop/src/main.tsx`.                         |
| `child-src 'self' blob:`           | WebKit — the WebView on Linux and macOS — does not always implement `worker-src`, and falls back to `child-src`. Without it the same worker pool fails on exactly the platforms that cannot be driven in CI.                                                         |
| `script-src 'self' blob:`          | Same worker pool: a blob worker's script is fetched under `script-src` in some engines.                                                                                                                                                                              |
| `style-src 'self' 'unsafe-inline'` | The single genuine compromise — see below.                                                                                                                                                                                                                           |
| `img-src 'self' data: blob:`       | Service icons and the Vellum logo are inlined as `data:` URIs (`packages/core/src/service-icons.ts`, `packages/core/src/assets/vellum-logo.ts`); the PNG export capture path hands MapLibre a `blob:` (`packages/renderer-webgl/src/capture/map-render-capture.ts`). |
| `connect-src 'self' data:`         | The DEM protocol decodes an embedded elevation tile with `fetch()` over a `data:` URI (`packages/renderer-webgl/src/sources/dem-protocol.ts`). No remote origin appears here, and the guardrail below fails if one ever does.                                        |
| `font-src 'self'`                  | `@font-face` rules point at bundled `/assets/*.woff2` (`packages/ui/src/styles/01-settings.css`); map glyphs are relative `.pbf` files in `apps/desktop/public/glyphs/`.                                                                                             |

### Why `'unsafe-inline'` is in `style-src`

Radix's Dialog pulls in `react-remove-scroll`, which injects a `<style>` element
at runtime to lock body scrolling. It looks for a nonce on `__webpack_nonce__`,
which Vite does not define, so the injected element carries no nonce and a
strict `style-src` blocks it — taking every modal in the app with it. The
alternatives are replacing the Dialog primitive or patching a transitive
dependency; neither is worth the risk for a local-only application whose only
scripts come from its own bundle.

React's `style={{ … }}` props are **not** a reason: those go through CSSOM and
never produce an inline `<style>` attribute the CSP inspects.

### Why `'unsafe-eval'` is absent, permanently

There is no `eval`, no `new Function`, and no `WebAssembly` instantiation in
either the sources or the built bundle. `pnpm check:network` fails if
`'unsafe-eval'` ever appears in the policy, so re-adding it is a deliberate act,
not a quiet one.

### The updater is not in `connect-src`

The update check runs in Rust (`apps/desktop/src-tauri/src/updater.rs`) through
`tauri-plugin-updater`, not in the WebView. Its endpoint is governed by
`plugins.updater.endpoints`, not by the CSP, and putting it in `connect-src`
would grant the WebView an ability it does not need.

## 2. Dependency audit

`pnpm audit:deps` ([`scripts/audit-deps.mjs`](../../scripts/audit-deps.mjs))
runs two audits and prints one markdown report:

- `pnpm audit` over `pnpm-lock.yaml`.
- `cargo deny check advisories` over `Cargo.lock`, configured by
  [`deny.toml`](../../deny.toml) — advisories only, no licence or ban policy.

It runs in CI as the `dependency-audit` job on every pull request, and again in
`publish-release.yml`, where its report is embedded in the release's
`signing-evidence.md`.

**It never fails a check, by decision.** The advisory database changes
independently of this repository, so a red check would mean "an advisory was
published today", not "this pull request broke something" — and a check that
goes red for reasons nobody in the pull request can fix is a check people learn
to ignore. The script always exits 0 and the CI job additionally carries
`continue-on-error: true`. What is guaranteed instead is visibility: the report
lands in the run summary and, for releases, in a versioned asset.

Reading the findings: most JavaScript advisories in this tree affect build
tooling (Vite's dev server, esbuild, turbo) that never reaches the desktop
binary. A finding matters here when it touches a runtime dependency of the
shipped app or of the parser.

## 3. Code signing

**Policy: publishing without a platform code-signing certificate is legitimate
and does not block the release. Publishing without saying so is not.**

Two different signatures are involved, and only one of them is optional:

| Signature                                                | Blocking? | What it protects                                                                                                                                                                         |
| -------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tauri updater signing (`TAURI_SIGNING_PRIVATE_KEY`)      | **Yes**   | Every update the app installs is verified against the pubkey in `tauri.conf.json`. Without it `latest.json` does not validate and the release fails before any platform starts building. |
| Platform code signing (Authenticode, Apple Developer ID) | No        | Operating-system trust at install time. Absence downgrades the install experience; it does not weaken the update channel.                                                                |

What an unsigned build means for a user:

- **Windows** — the MSI and EXE carry no Authenticode signature. SmartScreen
  shows an **Unknown publisher** warning and the user must choose _More info →
  Run anyway_. Note that SmartScreen reputation also depends on install-base
  telemetry, so even a freshly signed certificate warns at first.
- **macOS** — the app is neither signed nor notarized. Gatekeeper refuses the
  first launch; the user has to allow it in **System Settings → Privacy &
  Security**, or right-click the app and choose _Open_.
- **Linux** — AppImage, DEB and RPM carry no equivalent publisher signature, so
  there is nothing to be missing.

Where the evidence lives: every release carries a **`signing-evidence.md`**
asset, generated in `publish-release.yml` from the same preflight outputs that
decide the wording of the release notes — the two cannot disagree, because
neither is written by hand. It records, per platform, whether the installer is
code-signed, whether the updater artifacts are signed, and the dependency-audit
summary for that commit. The release notes carry a high-visibility warning for
each unsigned platform.

### The macOS caveat

`tauri.conf.json` declares no `signingIdentity` and no `hardenedRuntime`, and
the release pipeline remounts and repackages the DMG after the build to add the
install readme — which would invalidate a signature applied by `tauri build`.
Signing macOS therefore is not a matter of adding a secret: that repackaging
step has to be reworked first, or the signature applied after it. This is
documented rather than fixed, and the release-verification matrix says so.

## 4. Network surface

Vellum is a local application. It opens exactly one connection, and only when
asked to:

- **The update check** — `tauri-plugin-updater` contacting
  `https://github.com/sebas-tcotd/vellum/releases/latest/download/latest.json`
  at startup. It is **opt-out**: the Rust shell reads `autoUpdateEnabled` from
  `preferences.json` before spawning the check
  (`apps/desktop/src-tauri/src/lib.rs`), so turning the preference off means no
  socket is opened at all — not a silent check whose result is hidden. Missing
  key or missing file means enabled, so a fresh install behaves as before.
  Nothing is ever installed without an explicit click on the update toast.

That is the whole list. There is no telemetry, no crash reporting and no
analytics in the desktop app — not even opt-in. Nothing about a user's cities,
usage or machine leaves it.

### The guardrail

`pnpm check:network`
([`scripts/verify-network-surface.mjs`](../../scripts/verify-network-surface.mjs))
runs in the `lint-and-test` CI job and **does** block. Three passes:

1. **Production frontend sources** (`apps/desktop/src`, `packages/*/src`) may
   not use `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
   `sendBeacon`, `axios`, or name an analytics or crash-reporting SDK. Tests
   are excluded, and `apps/landing/**` is out of scope entirely — the marketing
   site does run Google Analytics, and it ships nothing into the binary.
2. **Rust manifests** may not take a direct dependency on `tauri-plugin-http`,
   `tauri-plugin-shell`, `tauri-plugin-websocket`, `reqwest`, `ureq` or `hyper`.
3. **The declared surface** must still say what it says today: a non-null CSP
   with no `'unsafe-eval'` and a local `connect-src`, no `fs:`/`http:`/`shell:`
   permission in
   [`capabilities/default.json`](../../apps/desktop/src-tauri/capabilities/default.json),
   and exactly the updater endpoint above.

The one annotated exception is the `data:`-URI `fetch` in `dem-protocol.ts`,
marked with a `vellum-allow-network:` comment stating why. The script's own
suite (`scripts/verify-network-surface.test.mjs`) pins each rule against a
synthetic repository, because a guardrail nobody has seen fail is
indistinguishable from one that matches nothing.

It lives in a node script rather than in ESLint on purpose: `no-restricted-imports`
cannot see `fetch(` or `new WebSocket(`, and `eslint.config.mjs` ignores
`**/src-tauri/**`, so ESLint would never look at the Rust side or the
capability JSON at all.

### WebView capabilities

`capabilities/default.json` grants the WebView no filesystem and no HTTP
permission: every file operation goes through an explicit Rust command with its
own validation. The opener permission is scoped to
`https://github.com/sebas-tcotd/vellum` and its subpaths — the only two external
URLs the app opens are the repository link in the About dialog and the release
notes for a pending update. The unscoped `opener:default` would have let the
WebView open any URL at all, which is the shape a data-exfiltration bug takes in
an app with no other network surface.
