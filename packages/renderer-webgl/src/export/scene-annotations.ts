/**
 * Derives labels and symbol instances from what `CityData` already holds.
 *
 * @remarks
 * The governing rule is that **nothing is invented**. A label exists only
 * because the domain carried a name or an identifier for that entity; where it
 * does not, the shortfall is reported as an aggregated warning rather than
 * filled in with plausible-looking text.
 *
 * The coverage matrix, stated once so it can be tested rather than inferred:
 *
 * | Layer | Labelled? | Source |
 * | --- | --- | --- |
 * | `districts` | yes | `District.name` + `District.position` |
 * | `districts` (parks) | yes | `ParkArea.name` + `ParkArea.position`, gated on `showParkAreas` |
 * | `transit` | yes | `TransitLine.name`, falling back to `TransitLine.id` |
 * | `roads` | **no** | `.cslmap` carries no street names — nothing to label with |
 * | `buildings` | **no** | `Building.name` is an asset name, not a place name |
 * | `terrain`/`water`/`forests` | **no** | No per-entity domain identity |
 *
 * `Building.name` is deliberately excluded: it is the game's asset identifier
 * ("Small House 03"), not a name a cartographer would print on a map, and
 * labelling every footprint with it would bury the map in noise.
 */

import type {
  CityData,
  LayerOptions,
  LayerVisibility,
  SceneLabel,
  SceneLabelStyle,
  SceneSymbolId,
  SceneSymbolInstance,
  TransitMode,
} from '@vellum/core';
import type { ResolvedColors } from '../style-adapter';

/**
 * Font stack used by every exported label.
 *
 * @remarks
 * No font file is embedded. DM Mono is named first so a machine that already
 * has the app's typeface matches it, then generic monospace families the
 * viewer always resolves — which is what keeps the document working offline
 * without shipping a `.woff`. See `resolveLabelStyle` for why layout stays
 * deterministic regardless of what the stack resolves to.
 */
export const LABEL_FONT_FAMILY = "'DM Mono', ui-monospace, monospace";

/** Label sizes in output pixels, per label kind. */
const DISTRICT_FONT_PX = 13;
const PARK_FONT_PX = 11;
const TRANSIT_FONT_PX = 10;

/** Halo width in output pixels — a stroke behind the glyphs, never a raster. */
const HALO_WIDTH_PX = 2.5;

/**
 * Collision priority per label kind; lower wins.
 *
 * @remarks
 * Districts name whole areas and are the coarsest, most useful text on a city
 * map, so they win over park and line names when the space is contested.
 */
const PRIORITY = Object.freeze({ district: 0, park: 1, transit: 2 });

/** Transit modes mapped onto their catalogue entry. */
const SYMBOL_BY_MODE: Readonly<Record<TransitMode, SceneSymbolId>> =
  Object.freeze({
    Bus: 'transit-bus',
    Tram: 'transit-tram',
    Train: 'transit-train',
    Metro: 'transit-metro',
    CableCar: 'transit-cablecar',
    Monorail: 'transit-monorail',
    Ferry: 'transit-ferry',
    Blimp: 'transit-blimp',
    Trolleybus: 'transit-trolleybus',
    Unknown: 'transit-unknown',
  });

/** Rendered size of a transit symbol, in output pixels. */
const TRANSIT_SYMBOL_PX = 11;

/** What one annotation pass produced, plus what it could not represent. */
export interface SceneAnnotations {
  /** Labels in deterministic order. */
  readonly labels: readonly SceneLabel[];
  /** Symbol instances in deterministic order. */
  readonly symbols: readonly SceneSymbolInstance[];
  /** Entities skipped because the domain held no text for them. */
  readonly missingLabelSources: number;
  /** Instances that fell back to the generic marker. */
  readonly symbolFallbacks: number;
}

/** Inputs the annotation pass reads; all already captured in the snapshot. */
export interface SceneAnnotationInput {
  /** Immutable city model, read and never mutated. */
  readonly cityData: CityData;
  /** Layer visibility captured at export time. */
  readonly activeLayers: Readonly<LayerVisibility>;
  /** Per-layer options captured at export time. */
  readonly layerOptions: Readonly<LayerOptions>;
  /** Resolved theme colours. */
  readonly colors: ResolvedColors;
  /** Background the document paints, so halos can contrast with it. */
  readonly background: string | null;
}

/**
 * Builds every label and symbol for one scene.
 *
 * @param input - Captured city, visibility, and resolved colours.
 * @returns Annotations plus counts of what could not be represented.
 */
export function buildSceneAnnotations(
  input: SceneAnnotationInput,
): SceneAnnotations {
  const labels: SceneLabel[] = [];
  const symbols: SceneSymbolInstance[] = [];
  let missingLabelSources = 0;
  let symbolFallbacks = 0;

  if (input.activeLayers.districts) {
    for (const district of input.cityData.districts) {
      if (!hasText(district.name)) {
        missingLabelSources += 1;
        continue;
      }
      labels.push({
        id: `label-district-${district.id}`,
        layer: 'districts',
        entityId: district.id,
        text: district.name.trim(),
        at: { x: district.position.x, z: district.position.z },
        anchor: 'center',
        priority: PRIORITY.district,
        style: resolveLabelStyle(DISTRICT_FONT_PX, 600, input, 'district'),
      });
    }

    if (input.layerOptions.districts.showParkAreas) {
      for (const park of input.cityData.parkAreas) {
        if (!hasText(park.name)) {
          missingLabelSources += 1;
          continue;
        }
        labels.push({
          id: `label-park-${park.id}`,
          layer: 'districts',
          entityId: park.id,
          text: park.name.trim(),
          at: { x: park.position.x, z: park.position.z },
          anchor: 'center',
          priority: PRIORITY.park,
          style: resolveLabelStyle(PARK_FONT_PX, 400, input, 'park'),
        });
      }
    }
  }

  if (input.activeLayers.transit) {
    const visibleModes = new Set<string>(
      input.layerOptions.transit.visibleModes,
    );
    for (const line of input.cityData.transitLines) {
      if (!visibleModes.has(line.mode)) continue;
      const at = firstStopPosition(line);
      if (!at) continue;

      // Falling back to the identifier is not fabrication: an id is a real
      // datum the user can correlate with the game. An empty name is not.
      const text = hasText(line.name) ? line.name.trim() : line.id;
      labels.push({
        id: `label-transit-${line.id}`,
        layer: 'transit',
        entityId: line.id,
        text,
        at,
        anchor: 'left',
        priority: PRIORITY.transit,
        style: resolveLabelStyle(TRANSIT_FONT_PX, 500, input, 'transit'),
      });

      const symbol = SYMBOL_BY_MODE[line.mode];
      if (symbol === 'transit-unknown') symbolFallbacks += 1;
      symbols.push({
        id: `symbol-transit-${line.id}`,
        symbol: symbol ?? 'transit-unknown',
        layer: 'transit',
        entityId: line.id,
        at,
        sizePx: TRANSIT_SYMBOL_PX,
        color: line.color || input.colors.ferry,
      });
    }
  }

  return { labels, symbols, missingLabelSources, symbolFallbacks };
}

/**
 * Resolves typography for one label kind from the theme.
 *
 * @remarks
 * The halo takes the document background rather than a fixed white, so text
 * stays readable on a dark export without a second palette. Sizes are the
 * export's own policy — the theme contract deliberately excludes dimensions.
 */
function resolveLabelStyle(
  fontSizePx: number,
  fontWeight: number,
  input: SceneAnnotationInput,
  kind: 'district' | 'park' | 'transit',
): SceneLabelStyle {
  return {
    fontFamily: LABEL_FONT_FAMILY,
    fontSizePx,
    fontWeight,
    color:
      kind === 'transit'
        ? input.colors.districtLabel
        : input.colors.districtLabel,
    // A transparent export has no background to contrast against, so the halo
    // is omitted rather than guessed — an invented colour would be the one
    // thing the user cannot restyle away.
    ...(input.background !== null
      ? { haloColor: input.background, haloWidthPx: HALO_WIDTH_PX }
      : {}),
  };
}

function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Anchors a line's label at its first stop, the only position it truly has. */
function firstStopPosition(
  line: CityData['transitLines'][number],
): { x: number; z: number } | null {
  const stop = line.stops[0];
  if (!stop) return null;
  const { x, z } = stop.position;
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}
