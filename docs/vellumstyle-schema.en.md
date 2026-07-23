# The `.vellumstyle` schema (v1)

A `.vellumstyle` file is a JSON document that describes the complete color palette Vellum
uses to render a city — terrain, water, roads, buildings, forests, transit, and districts.
Vellum ships 5 built-in themes (Day, Transit, Classic, Grayscale, Grayscale + Water) and
loads any additional `.vellumstyle` files a user installs (see
["Installing a theme"](#installing-a-theme) below).

This document is the public, stable reference for modders and theme authors. It describes
the **actual current behavior of the app** — not aspirational or planned behavior.

## Backward compatibility guarantee

A `.vellumstyle` file that is valid today will keep loading without errors in future
versions of Vellum, even after the schema evolves (NFR11). This is enforced by two
mechanisms working together:

- **`schemaVersion` migration.** Every file must declare a `schemaVersion`. Vellum runs it
  through a migration step before validating it; each past schema version has its own
  migration path to the current shape, so an old file is upgraded in memory rather than
  rejected.
- **Unknown fields are ignored, not rejected** (see [Extension points](#extension-points)).
  This means a future Vellum version can add new optional fields to the schema without
  breaking files written before those fields existed, and a file written for a newer schema
  that happens to be loaded by an older Vellum build still loads — the older build simply
  ignores fields it doesn't understand.

### `schemaVersion` is an integer, not a semver string

`schemaVersion` starts at `1` and is a **plain integer**, not a `"major.minor.patch"`
string. Every built-in theme ships `"schemaVersion": 1`. Future breaking changes to the
schema increment this integer (`2`, `3`, ...); Vellum's migration step has a `case` branch
per past version. There is no separate minor/patch tracking — additive, non-breaking
changes (new optional fields) don't require a `schemaVersion` bump at all, since old files
without those fields keep validating under the same version thanks to the extension-point
rule above.

## Top-level shape

```ts
interface VellumStyle {
  schemaVersion: number; // starts at 1
  name: string; // display name shown on the theme selector pill
  // ...plus every field of RenderStyleParams, below
}
```

## Color types

Every color field in the schema accepts one of two string formats:

- **`HexColor`** — `#rgb`, `#rgba`, `#rrggbb`, or `#rrggbbaa` (3, 4, 6, or 8 hex digits
  after the `#`). Example: `"#f2efe9"`.
- **`HslColor`** — a CSS `hsl(...)` function string. Hue may optionally carry a `deg`
  suffix, saturation/lightness are percentages, and an optional alpha channel may follow
  after a comma or a `/`. Example: `"hsl(210, 40%, 60%)"`.

No other color format (`rgb()`, named CSS colors like `"red"`, etc.) is accepted. A field
that doesn't match either pattern fails validation for the **entire file** — see
[Validation behavior](#validation-behavior).

## `RenderStyleParams` fields

| Field               | Type                  | Description                                                                                                                                                                  |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mapBackground`     | `ColorToken`          | Background color behind the terrain (visible outside the map bounds).                                                                                                        |
| `terrain.base`      | `ColorToken`          | Base/flat elevation color.                                                                                                                                                   |
| `terrain.low`       | `ColorToken`          | Low elevation color.                                                                                                                                                         |
| `terrain.mid`       | `ColorToken`          | Mid elevation color.                                                                                                                                                         |
| `terrain.high`      | `ColorToken`          | High elevation color.                                                                                                                                                        |
| `water`             | `ColorToken`          | Color of water bodies (sea and inland water).                                                                                                                                |
| `forests`           | `ColorToken`          | Color of forest/vegetation density markers.                                                                                                                                  |
| `transitBackground` | `ColorToken`          | Reserved for the Transit theme's dimming feature. Every built-in theme sets it; there is no independent visual behavior tied to this field today beyond being a valid color. |
| `roads`             | `RoadColorParams`     | Road network colors, grouped by tier — see below.                                                                                                                            |
| `buildings`         | `BuildingColorParams` | Building colors, grouped by zoning category — see below.                                                                                                                     |
| `districts.fill`    | `ColorToken`          | Fill color of the district marker.                                                                                                                                           |
| `districts.label`   | `ColorToken`          | Text color of the district label.                                                                                                                                            |

### `roads` (`RoadColorParams`)

Every leaf in this tree is a `{ fill, casing }` pair (`RoadCategoryColors`) — `fill` colors
the road surface, `casing` colors the outline drawn around it for figure-ground contrast.
Road **widths** are never part of this schema — they're a fixed renderer constant, not a
theme concern.

| Path                   | Variants                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| `roads.highway`        | `generic`, `industrial` — mainline highways and connector ramps          |
| `roads.largeArterial`  | `generic`, `industrial` — 6-lane-equivalent arterials                    |
| `roads.mediumArterial` | `generic`, `industrial` — 4-lane-equivalent arterials                    |
| `roads.local`          | `generic`, `industrial`, `gravel` — 2-lane local streets                 |
| `roads.pedestrian`     | `path`, `way`, `street` — pedestrian-only ways                           |
| `roads.rail`           | `train`, `tram`, `monorail`, `metro` — rail-based transit infrastructure |
| `roads.ferry`          | (single leaf, no variants) — ferry/ship path water transit routes        |

### `buildings` (`BuildingColorParams`)

Every leaf is a `{ fill, stroke }` pair (`BuildingCategoryColors`) — `fill` colors the
building footprint, `stroke` colors its outline. Buildings are colored by
`Building.serviceType` (mapped 1:1 from the `.cslmap` `subsrv` attribute); the full
`subsrv` → category mapping lives in `BUILDING_SERVICE_TYPE_CATEGORY`
(`packages/core/src/types/theme.ts`) and is summarized here:

| Path                    | Variants                                       | Example `subsrv` values mapped here                                             |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `buildings.residential` | `low`, `high`, `selfSufficient`                | `ResidentialLow/High`, `ResidentialLow/HighEco`                                 |
| `buildings.commercial`  | `low`, `high`, `leisure`, `tourism`, `organic` | `CommercialLow/High`, `CommercialLeisure`, `CommercialTourist`, `CommercialEco` |
| `buildings.office`      | `generic`, `tech`, `financial`                 | `OfficeGeneric`, `OfficeHightech`, `OfficeFinancial`                            |
| `buildings.industry`    | `generic`, `forestry`, `ore`, `oil`, `farming` | `IndustrialGeneric/Forestry/Ore/Oil/Farming`, `PlayerIndustryForestry`          |
| `buildings.civic`       | `publicTransport`, `education`, `services`     | `PublicTransport*`, `PlayerEducation*`, `BeautificationParks`                   |
| `buildings.none`        | (single leaf, no variants)                     | `None` — unzoned buildings and landmarks (the most common case)                 |

Any `subsrv` value not listed above — including the parser's own `'unknown'` fallback —
resolves to `buildings.civic.services`.

## Validation behavior

When Vellum loads a `.vellumstyle` file, it walks the expected shape and checks that every
color leaf is present and matches `HexColor`/`HslColor`. If **any single field** is missing
or malformed, the **entire file** is skipped (not just that field) and a warning names the
exact offending path, e.g.:

> `day.vellumstyle is not valid: field roads.highway.generic.fill not recognized`
> (the exact wording depends on the user's locale)

Valid themes in the same directory still load normally — one broken file never blocks the
others.

## Extension points

Any field present in a `.vellumstyle` file that isn't part of the schema above — at the top
level or nested inside an existing group — is **silently ignored**. It does not cause a
validation error, and it has no effect on rendering. This lets a theme author attach their
own metadata (e.g. an `_authorNotes` or `_website` field) without risking future
incompatibility, and lets Vellum add new optional fields later without breaking existing
files. This is a structural property of how validation walks the schema (only known fields
are checked), not a special case that needs to be requested — it works today, for any
unrecognized field, without any extra syntax.

## Full example

The built-in **Day** theme, reproduced verbatim
(`apps/desktop/src-tauri/resources/themes/day.vellumstyle`):

```json
{
  "schemaVersion": 1,
  "name": "Day",
  "mapBackground": "#f2efe9",
  "terrain": {
    "base": "#f2efe9",
    "low": "#9fd17a",
    "mid": "#e4dfc9",
    "high": "#c9ad7f"
  },
  "water": "#aad3df",
  "forests": "#cdebb0",
  "transitBackground": "#1a1a2e",
  "roads": {
    "highway": {
      "generic": { "fill": "#4a4a4a", "casing": "#2e2e2e" },
      "industrial": { "fill": "#5a5248", "casing": "#39332c" }
    },
    "largeArterial": {
      "generic": { "fill": "#6b6b6b", "casing": "#4a4a4a" },
      "industrial": { "fill": "#786d5e", "casing": "#544c41" }
    },
    "mediumArterial": {
      "generic": { "fill": "#8c8c8c", "casing": "#6b6b6b" },
      "industrial": { "fill": "#948a78", "casing": "#6d6455" }
    },
    "local": {
      "generic": { "fill": "#b0afaa", "casing": "#8c8c8c" },
      "industrial": { "fill": "#b3a993", "casing": "#8c8271" },
      "gravel": { "fill": "#c9c2b0", "casing": "#a69c88" }
    },
    "pedestrian": {
      "path": { "fill": "#a08770", "casing": "#7a6754" },
      "way": { "fill": "#b09d88", "casing": "#8b7d6b" },
      "street": { "fill": "#a08770", "casing": "#7a6754" }
    },
    "rail": {
      "train": { "fill": "#ececec", "casing": "#4a4a4a" },
      "tram": { "fill": "#ececec", "casing": "#555555" },
      "monorail": { "fill": "#ececec", "casing": "#555555" },
      "metro": { "fill": "#ececec", "casing": "#e4572e" }
    },
    "ferry": { "fill": "#4a90a4", "casing": "#4a90a4" }
  },
  "buildings": {
    "residential": {
      "low": { "fill": "#d9cba3", "stroke": "#b8a47d" },
      "high": { "fill": "#c9b48a", "stroke": "#a38f68" },
      "selfSufficient": { "fill": "#c3d9a8", "stroke": "#9db885" }
    },
    "commercial": {
      "low": { "fill": "#e8b4a0", "stroke": "#c98f7a" },
      "high": { "fill": "#de9c86", "stroke": "#ba7a65" },
      "leisure": { "fill": "#e8c4e0", "stroke": "#c29ab8" },
      "tourism": { "fill": "#e8d4a0", "stroke": "#c2ad78" },
      "organic": { "fill": "#b8d4a8", "stroke": "#94ad82" }
    },
    "office": {
      "generic": { "fill": "#a8c4d9", "stroke": "#7fa0b8" },
      "tech": { "fill": "#8fb8d9", "stroke": "#6b93b8" },
      "financial": { "fill": "#7a9cc2", "stroke": "#5c7da3" }
    },
    "industry": {
      "generic": { "fill": "#d9c97a", "stroke": "#b8a85c" },
      "forestry": { "fill": "#a8c47a", "stroke": "#86a35c" },
      "ore": { "fill": "#b89478", "stroke": "#96755c" },
      "oil": { "fill": "#8c8570", "stroke": "#6b6554" },
      "farming": { "fill": "#c4b87a", "stroke": "#a3985c" }
    },
    "civic": {
      "publicTransport": { "fill": "#c2a8d9", "stroke": "#9c82b8" },
      "education": { "fill": "#a8d9c4", "stroke": "#82b89c" },
      "services": { "fill": "#d9a8a8", "stroke": "#b88282" }
    },
    "none": { "fill": "#c8bfb5", "stroke": "#a09585" }
  },
  "districts": { "fill": "#e8d97a", "label": "#2e2e2e" }
}
```

## Installing a theme

1. Copy your `.vellumstyle` file into Vellum's user themes directory (created
   automatically the first time Vellum runs, if it doesn't already exist):

   | Platform | Path                                                      |
   | -------- | --------------------------------------------------------- |
   | macOS    | `~/Library/Application Support/com.vellum.desktop/themes` |
   | Windows  | `%APPDATA%\com.vellum.desktop\themes`                     |
   | Linux    | `~/.local/share/com.vellum.desktop/themes`                |

2. Restart Vellum. Themes are read once at startup — there is no hot-reload of the user
   themes directory while the app is running.
3. Your theme appears in the theme selector alongside the 5 built-in themes, using its
   filename (without the `.vellumstyle` extension) as its stable id and its `name` field as
   the display label on the pill.

If your file uses the same filename (id) as a built-in theme (e.g. `day.vellumstyle`),
your version silently takes precedence over the built-in one — this lets you override a
built-in theme without any special configuration.
