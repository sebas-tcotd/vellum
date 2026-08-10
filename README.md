# Vellum

<p align="center">
  <img src="packages/renderer-webgl/src/assets/vellum-logo.svg" alt="Vellum logo" width="148" />
</p>

<p align="center">
  <strong>Turn your Cities: Skylines city into a map worth keeping.</strong><br />
  A modern, cross-platform viewer for exploring, understanding and sharing your city.
</p>

<p align="center">
  <a href="https://github.com/sebas-tcotd/vellum/releases/latest">Download the latest release</a>
  · <a href="docs/es/index.md">Leer en español</a>
  · <a href="CONTRIBUTING.md">Contribute</a>
</p>

<p align="center">
  <a href="https://github.com/sebas-tcotd/vellum/actions/workflows/ci.yml"><img src="https://github.com/sebas-tcotd/vellum/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2f6f73.svg" alt="MIT license" /></a>
  <a href="https://github.com/sebas-tcotd/vellum/releases/latest"><img src="https://img.shields.io/github/v/release/sebas-tcotd/vellum?label=latest%20release" alt="Latest release" /></a>
</p>

> **For players:** open a `.cslmap` export and explore your city as a real interactive map.
> **For contributors:** help build the open-source cartographic toolkit that Cities: Skylines has been missing.

![Vellum Readme Hero](./docs/assets/readme/hero-map-costa-tijuca.webp)

## Why Vellum?

Cities: Skylines lets you build entire worlds. Vellum gives those worlds a second life outside the game: a native desktop experience for exploring terrain, roads, transit, buildings, forests and districts as coherent, layered maps.

The core idea is simple: **the visual quality of a city is part of the product, not decoration applied at the end.**

Vellum runs on Windows, macOS and Linux using Tauri 2, Rust, React, TypeScript and MapLibre GL JS.

## Start here

### Download and open a city

Download the installer for your platform from the [latest GitHub Release](https://github.com/sebas-tcotd/vellum/releases/latest), then open a `.cslmap` file exported from [CSL Map View](https://steamcommunity.com/sharedfiles/filedetails/?id=845665815).

For the current v1 workflow, **CSL Map View is the exporter; Vellum is the modern viewer.** Vellum does not yet read a live city directly from the game. This deliberate two-tool path preserves compatibility with the format the community already uses while Vellum focuses on a better exploration experience.

<details>
<summary>Platform notes</summary>

- **Windows:** run the `.msi`. File association is opt-in during installation. Releases are configured for Authenticode signing; an explicitly unsigned build may show an unknown-publisher warning.
- **macOS:** open the `.dmg` and move Vellum to `Applications`. v1 is not notarized by Apple, so clear quarantine once with `xattr -cr /Applications/Vellum.app` if Gatekeeper blocks it.
- **Linux:** make the `.AppImage` executable and run it.

</details>

### Try it from source

You do not need Cities: Skylines 1 or your own save to try the development build. The repository includes real city fixtures.

```bash
git clone https://github.com/sebas-tcotd/vellum.git
cd vellum
pnpm install
pnpm dev
```

Drop [`altavento.cslmap`](packages/parser-cslmap/fixtures/altavento.cslmap) or [`aurelia-del-delta.cslmap`](packages/parser-cslmap/fixtures/aurelia-del-delta.cslmap) onto the app window.

<details>
<summary>Development requirements</summary>

| Tool      | Version                             |
| --------- | ----------------------------------- |
| Node.js   | 20                                  |
| pnpm      | `10.33.0`                           |
| Rust      | `1.96.0` from `rust-toolchain.toml` |
| Tauri CLI | 2.x                                 |

Before `pnpm install` or `pnpm dev`, install the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

</details>

## What you can do today

- Open `.cslmap` files with drag and drop or `Ctrl/Cmd+O`.
- Explore seven independent layers: terrain, basemap and water, roads, transit, buildings, forests and districts.
- Pan and zoom a full city with GPU-accelerated MapLibre rendering.
- Inspect transit lines and stops through contextual map interactions.
- Stay oriented with the minimap and keyboard-friendly navigation.
- Toggle clean mode with `H` and switch between built-in visual themes.
- Use the interface in English or Spanish.
- Export the current view as PNG (1×–4×) or editable SVG.
- Load damaged files and unknown-DLC assets through controlled fallbacks where possible.

![Layer stack Vellum](./docs/assets/readme/layer-stack-pepper-lake.webp)

Layers reveal the city; transit turns its infrastructure into a readable network.

![Detailed transit network rendered by Vellum](./docs/assets/readme/transit-network-pepper-lake.webp)

## The engineering story

Vellum began with a Canvas 2D renderer. As maps grew, CPU-rendered overscan hit a performance ceiling. A focused spike proved that MapLibre GL JS and WebGL could deliver the target experience, so the active renderer moved there while the legacy Canvas implementation remained as a tested reference.

That pivot was possible because the domain model was separated from rendering from the start. The package graph is intentionally one-directional, and `pnpm check:architecture` enforces it.

```mermaid
flowchart LR
  A[".cslmap export"] --> B["Rust parser"]
  B --> C["Immutable CityData"]
  C --> D["MapLibre renderer"]
  D --> E["React UI in Tauri"]
  T["Theme engine"] --> D
```

```mermaid
graph TD
  desktop["apps/desktop<br/>(composition root)"] --> ui
  desktop --> parser
  desktop --> renderer
  desktop --> themes
  desktop --> core
  ui --> renderer
  ui --> themes
  ui --> core
  parser --> core
  renderer --> core
  themes --> core
```

`@vellum/core` is the dependency-free domain and IPC layer. `apps/desktop` is the only composition root. The active `MapLibreRoot` still uses MapLibre-specific APIs at the UI boundary, so renderer interchangeability is a deliberate architectural direction rather than a claim that every edge is already abstracted.

## Project status

| Area                                          | Status                |
| --------------------------------------------- | --------------------- |
| File loading, Rust parser and domain model    | Complete              |
| Cartographic rendering and MapLibre migration | Complete              |
| Exploration UI, layers and themes             | Complete              |
| PNG/SVG export                                | Complete              |
| i18n, preferences and update checks           | Complete              |
| Packaging and distribution                    | Configured for v0.4.0 |
| Vellum-native in-game exporter                | Future direction      |

The future exporter would remove the dependency on `.cslmap`, unlock richer data from the Cities: Skylines modding API and support the next generation of Vellum features. It is not required for the first useful viewer release.

<!--
VISUAL: Optional theme comparison — one cartographic scene, three visual languages.
PURPOSE: Support the claim that Vellum treats visual quality as part of the product and that
themes are a real presentation tool, not a color-picker demo.
COMPOSITION:
- Reuse the exact same city, camera, visible layers and crop for three side-by-side panels.
- Use `spring-valley.cslmap` in `Day`, `Transit Dim` and `Transit`. This makes the comparison
  about changing the map's visual focus, not merely swapping arbitrary color palettes.
- Do not include all five themes: three is enough to show range without turning the README
  into a theme gallery.
- Use a regional-to-city-wide view with a strong river/coastline and visible urban structure.
  Avoid a featureless suburb where the palette differences disappear.
- Use clean mode and add small external labels beneath each panel. Do not add decorative
  frames, fake browser chrome or color swatches detached from the map.
FORMAT: 3:1 or 16:9 WebP, ideally 1800×600 for a strip or 1800×1000 for a three-panel card.
SUGGESTED PATH: `docs/assets/readme/theme-comparison-spring-valley.webp`
PLACEMENT: Optional; place after the project-status paragraph and before `## Repository map`.
Skip it if the hero and layer composition already establish the visual identity strongly.
-->

## Repository map

| Path                                                   | Purpose                                           |
| ------------------------------------------------------ | ------------------------------------------------- |
| [`apps/desktop`](apps/desktop)                         | Tauri shell, native commands and composition root |
| [`packages/core`](packages/core)                       | Domain types and IPC contract                     |
| [`packages/parser-cslmap`](packages/parser-cslmap)     | `.cslmap` parsing adapter                         |
| [`packages/renderer-webgl`](packages/renderer-webgl)   | Active MapLibre renderer                          |
| [`packages/renderer-canvas`](packages/renderer-canvas) | Tested legacy Canvas reference                    |
| [`packages/theme-engine`](packages/theme-engine)       | Theme loading, validation and style parameters    |
| [`packages/ui`](packages/ui)                           | React components and interaction layer            |
| [`docs`](docs)                                         | Technical documentation and design references     |

## Useful commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm check:architecture
pnpm test
pnpm test:e2e
pnpm format:check
pnpm rust:fmt
pnpm rust:lint
pnpm rust:test
pnpm release:verify
```

Run a focused package test with:

```bash
pnpm --filter @vellum/renderer-webgl test
pnpm --filter @vellum/ui test -- MapLibreRoot.test.tsx
```

## Join the project

Vellum is early enough for thoughtful contributions to shape the product: rendering quality, parser resilience, export workflows, themes, documentation and community tooling are all meaningful surfaces.

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. For security issues, use [`SECURITY.md`](SECURITY.md); for community expectations, see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

If you are unsure where to begin, open an issue and describe the city workflow or problem you want to improve. A good issue is already a contribution.

## License

Vellum is released under the [MIT License](LICENSE).

## Acknowledgements

Built around the Cities: Skylines `.cslmap` export format and powered by [Tauri](https://tauri.app/), [Rust](https://www.rust-lang.org/), [React](https://react.dev/), [MapLibre GL JS](https://maplibre.org/) and [Turborepo](https://turborepo.com/).

Maintained by Sebastian Vargas with an emphasis on understanding before building, coherent systems and reducing friction without hiding complexity.
