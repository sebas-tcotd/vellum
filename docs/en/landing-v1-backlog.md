# Landing v1.0 redesign backlog

- [Español](../es/landing-v1-backlog.md)
- [Back to the English index](index.md)

Tasks identified during the landing v1.0 UX design (2026-10-05) that are not
landing implementation: product fixes, release work, and updates to the root
`DESIGN.md`. This is not the landing specification, which lives in the private
planning repository's UX workspace
(`_bmad-output/planning-artifacts/ux-designs/ux-vellum-2026-10-04/`, containing
`DESIGN.md` and `EXPERIENCE.md`).

Each entry explains what was found and what should change. Landing blockers
are identified explicitly.

## A. Product findings

1. **Marginalia source note: fixed (2026-10-06).**
   `buildMarginaliaContent` preserves `.cslmap` and `.vellummap`, case-insensitively.
   Names without a recognized extension use `CityData.source`. The Home 09 and
   manifesto print can include the source and data limitations block; Bridge
   filenames no longer receive an extra `.cslmap` suffix.
2. **Transit's "Dim other layers": verified with Costa Tijuca (2026-10-06).**
   Sebas's screenshot shows dark background layers and an emphasized network.
   The renderer reduces their opacity and needs no change. Landing copy now
   says "the rest of the map fades against a dark background". Also verify
   dimming when producing the landing export.
3. ~~**Release workflows do not publish SHA256.**~~ No longer needed: GitHub's
   releases API exposes a SHA-256 `digest` per asset (verified on `v0.14.0`).
   "Verify the download" (`/download/#verify`) reads it at build time;
   `publish-release.yml` needs no change (see C1).
4. **Bridge's Steam Workshop page must explain that Vellum Desktop is required.**
   Material for story 5.5.
5. **Standalone Bridge DLL build** for installation without Workshop. Product
   work; until available, `/download/#bridge-manual` displays "Coming soon"
   instead of a DLL download link.
6. **Distribution and signing docs: updated (2026-10-06).**
   README and `docs/{en,es}/packaging-and-installers.md` distinguish currently
   unsigned standalone installers from the unsigned MSIX for Store submission.
   Microsoft certification and signing are separate steps; updater signatures
   do not imply Authenticode signing either.

## B. What the root `DESIGN.md` should adopt

**Applied** to the root [`DESIGN.md`](../../DESIGN.md) (2026-10-05), with two
decisions from Sebas: the primary logo becomes **V + compass rose** (V alone
remains for small sizes), and DM Mono Italic is **landing-only** (export
marginalia uses the upright face). B8 remains pending, as does aligning app
text ink (B1), a separate product change.

Model C: a shared brand core for app and landing, plus a delta per surface.
Applying that core to the root `DESIGN.md` was **the first landing
implementation task** (Sebas's decision, 2026-10-05); it is complete.

1. Brand text ink is `#4A4035`. The app currently uses `#333333` for its wordmark
   and text.
2. Document coral `#D2938E` as a brand color: never use it for text or focus on
   paper (2.34:1).
3. A warm **brand** dark mode (`#1F1B17` family), distinct from Transit's
   functional blue-violet dark mode.
4. Source Serif 4 for editorial reading (long pieces, web). App UI stays in
   `system-ui`.
5. DM Mono Italic as the landing annotation voice, from the same family as
   export marginalia (which uses upright DM Mono).
6. Platform chrome variants (Fluent, Liquid Glass, Linux) as the app delta.
7. IM Fell English reserved for future uses, such as post-v1 timelapse.
8. Pending brand review: logo sizing system and small logo (see the UX
   workspace's `DESIGN.md`, Brand & Style, Logo).

Scope: a **documentation-only** PR. Changing app ink
(`packages/ui/src/styles/01-settings.css`, `#333333` to `#4A4035`) is a separate
product change requiring its own visual regression check. No shared token
package is created (two consumers do not justify one): the landing copies its
tokens from `DESIGN.md`.

## C. Architecture decisions (approved by Sebas, 2026-10-05)

1. **Download data at build time, not in the browser.** Astro reads GitHub's
   releases API at build time; the browser only detects the OS and highlights
   links already present in HTML (all three platforms remain visible without JS).
   - Select releases by `v<semver>` tag, excluding drafts and prereleases.
     Select each asset by pattern (`*_x64-setup.exe`, `*_universal.dmg`,
     `*_amd64.deb`, etc.), never by a fixed name or blindly trusting
     `/releases/latest`.
   - Checksums: each asset's `digest` field (see A3).
   - Redeploy: `deploy-pages.yml` runs via `workflow_run` after
     _publish-release_ succeeds. `on: release: published` does **not** work:
     releases published with `GITHUB_TOKEN` do not trigger other workflows.
   - Failure: API errors fail the build; Pages keeps the previous deployment.
     Missing platform assets use the "Release data unavailable" state from
     `EXPERIENCE.md`. CI uses `GITHUB_TOKEN` for request limits; local builds
     use a committed JSON fixture.
2. **Real app components: SSR without hydration inside Declarative Shadow DOM.**
   `AdvancedOptionsPanel` and `PlaceCard` only depend on props and
   `react-i18next`: React islands without a `client:` directive (zero JS),
   with an `i18next.createInstance()` per language. CSS lives in a separate
   `packages/ui/src/embed.css` (tokens, themes, components, utilities;
   **excluding** `03-generic.css`, which sets
   `body { min-width: 900px; overflow: hidden }`), with `:root` tokens moved
   to `:host`. `@font-face` and Tailwind v4's `@property` declarations live in
   the document because they do not work inside the shadow root.
   `data-platform` / `data-appearance` are set on an internal `div`.
   **First:** a half-day spike with Playwright comparisons against the app;
   if it fails, use fallback screenshots T37 and T35.
   **Spike complete (2026-10-05): viable.** All six comparisons (panel and
   card, each in light `linux`, light `macos`, and dark `linux`) have 0 %
   differing pixels versus a reference using full `globals.css`, with the
   goldens' comparator and threshold; leakage tests also report 0 %. The
   default token block from `02-themes.css` needed to apply to all four
   `data-platform` profiles: with plain `:host`, `var()` tokens resolved at
   the host (macOS card difference: 0.15 %, below threshold). Moving the
   wrapper into `src/` requires ES2022 `lib` and its own `@vellum/*` paths in
   the landing `tsconfig`. Figures and findings: `apps/landing/spike/REPORT.md`;
   code and tests: `apps/landing/spike/`, `apps/landing/tests-spike/`.
3. **Implementation order:** (1) ~~root `DESIGN.md` (section B)~~, complete;
   (2) Astro scaffold preserving `/vellum/#download` and `/vellum/privacy`,
   with tests, complete; (3) ~~release data at build time + workflow~~,
   complete; (4) ~~component CSS spike~~, complete (viable: real components,
   without T37/T35 screenshots); (5) pages.

## D. Cities used in screenshots

Third-party Workshop cities have no explicit permission from their authors.
The concern is community reputation at launch, more than technical risk,
and it is concentrated in the **showcase city** (about 30 shots), rather than
the gallery.

1. **Alternatives without a community author:** built-in game maps (empty
   terrain requiring a city to be built) or DLC scenarios starting with a city
   (already reviewed: see D3). These require no permission request to Paradox:
   game use is the same as any other Vellum screenshot. Keep the
   non-affiliation note and the rule against official logos or artwork.
2. **Parallel plan:** (a) optionally ask an author for permission;
   (b) ~~review DLC scenarios as backup~~, complete (D3);
   (c) if none works, build an original city on a game map.
3. **Choose the showcase before the capture session.** Candidates extracted
   from the base game and scenarios (2026-10-05): **Port Eden**,
   **Villebourg**, **Cormorant River**, and **Peach Trees**, all with
   `origen: 'juego'` and `permiso: 'no-aplica'`.
4. **Declarative content:** each city has a content file with
   `{ ciudad, autor?, origen: 'workshop' | 'propia' | 'juego', workshopId?, permiso: 'concedido' | 'pedido' | 'no' | 'no-aplica' }`.
   A CI test blocks deployment if the showcase or hero uses a Workshop city
   without `permiso: 'concedido'`. `autor` is required for `origen: 'workshop'`
   or `'propia'`; omit it for `'juego'`.
