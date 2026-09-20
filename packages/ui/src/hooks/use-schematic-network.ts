import { useMemo, useRef } from 'react';
import {
  TRANSIT_MODES,
  TOGGLABLE_TRANSIT_MODES,
  deriveTransitNetwork,
  filterSchematicLayout,
  geographicSchematicLayout,
  isSchematicLayoutEmpty,
  type CityData,
  type SchematicLayout,
  type SchematicLayoutStrategy,
  type TransitMode,
} from '@vellum/core';

/** One legend row: a line that is actually drawn right now. */
export interface SchematicLegendLine {
  /** Internal id. Never rendered — it is the React key and the filter key. */
  readonly lineId: string;
  /**
   * The line's in-game name, or `null` when it is missing or blank. A blank
   * name is a data gap, not a name: the surface says so in words instead of
   * falling back to the id.
   */
  readonly name: string | null;
  /** The colour the diagram paints this line with, taken from the layout. */
  readonly color: string;
}

/** Legend lines grouped by the mode that operates them. */
export interface SchematicLegendGroup {
  readonly mode: TransitMode;
  readonly lines: readonly SchematicLegendLine[];
}

/**
 * The single model the schematic surface and its sidebar both read.
 *
 * @remarks
 * Everything here is derived from *drawable* geometry: a line that exists in
 * the city's metadata but draws no stroke produces no legend row, no counter
 * and no available mode, because a control for something invisible cannot be
 * understood or undone.
 */
export interface SchematicNetworkModel {
  /** The layout as filtered by the current selection — what the SVG draws. */
  readonly layout: SchematicLayout;
  /** Whether the city has any drawable transit at all, before filtering. */
  readonly hasDrawableNetwork: boolean;
  /**
   * `true` when the city *does* draw something but the current selection hides
   * all of it — a recoverable state, unlike a city with no routes.
   */
  readonly isFilteredEmpty: boolean;
  /** Togglable modes with drawable geometry, in `TOGGLABLE_TRANSIT_MODES` order. */
  readonly availableModes: readonly TransitMode[];
  /** Which of {@link availableModes} are currently switched off. */
  readonly hiddenModes: ReadonlySet<TransitMode>;
  /** Legend of what is drawn right now, grouped by mode in canonical order. */
  readonly legend: readonly SchematicLegendGroup[];
  /** How many lines the diagram is drawing. */
  readonly visibleLineCount: number;
  /** Whether any station symbol is on screen, so the key can be earned. */
  readonly hasVisibleStations: boolean;
}

export interface UseSchematicNetworkOptions {
  cityData: CityData | null;
  /**
   * Modes the user switched off. `'Unknown'` is never in here: it has no label
   * and no control, so it stays visible by contract.
   */
  hiddenModes: readonly TransitMode[];
  /** Layout strategy; the geographic projection is the Story 4.1 baseline. */
  strategy?: SchematicLayoutStrategy;
  /**
   * Whether the schematic is the surface on screen. Deriving the network is
   * the expensive half of this hook and would otherwise run on every document
   * load for a view nobody opened; the result stays cached per document, so
   * leaving and re-entering the schematic costs nothing.
   */
  enabled?: boolean;
}

interface SchematicBase {
  readonly layout: SchematicLayout;
  readonly lines: readonly {
    readonly lineId: string;
    readonly color: string;
    readonly mode: TransitMode;
    readonly name: string | null;
  }[];
  readonly availableModes: readonly TransitMode[];
}

/**
 * A genuinely immutable empty set. Freezing the model object does not reach a
 * `Set`'s contents, so the mutators are shadowed as own properties before the
 * freeze: anything that tries to write to the shared singleton fails loudly
 * instead of poisoning every surface that defaults to it.
 */
function emptyModeSet(): ReadonlySet<TransitMode> {
  const set = new Set<TransitMode>();
  const refuse = (): never => {
    throw new TypeError('EMPTY_SCHEMATIC_MODEL.hiddenModes is immutable');
  };
  return Object.freeze(
    Object.assign(set, { add: refuse, delete: refuse, clear: refuse }),
  );
}

const EMPTY_LAYOUT: SchematicLayout = Object.freeze({
  bounds: Object.freeze({ width: 0, height: 0 }),
  segments: Object.freeze([]),
  stations: Object.freeze([]),
});

/**
 * The model of a surface with nothing to draw. Exported so a component can
 * default to it instead of accepting `undefined` and re-deciding what an
 * absent network means.
 */
export const EMPTY_SCHEMATIC_MODEL: SchematicNetworkModel = Object.freeze({
  layout: EMPTY_LAYOUT,
  hasDrawableNetwork: false,
  isFilteredEmpty: false,
  availableModes: Object.freeze([]),
  // A real immutable set: `Object.freeze` on the model does not reach inside a
  // `Set`, and this singleton is `MapViewport`'s default prop — one consumer
  // calling `.add()` on it would poison every surface for the whole process.
  hiddenModes: emptyModeSet(),
  legend: Object.freeze([]),
  visibleLineCount: 0,
  hasVisibleStations: false,
});

/**
 * Derives the transit network and its base layout once per city/strategy, then
 * projects the current selection onto it.
 *
 * @remarks
 * The two memos are deliberately separate. Deriving the network and laying it
 * out is the expensive half and depends only on the document, so toggling a
 * mode must not redo it; the projection is a filter over frozen data and is
 * the only thing a toggle recomputes. Filtering *before* the layout would move
 * every remaining station, so it never happens here.
 */
export function useSchematicNetwork({
  cityData,
  hiddenModes,
  strategy = geographicSchematicLayout,
  enabled = true,
}: UseSchematicNetworkOptions): SchematicNetworkModel {
  // Per document and strategy: the network, its base layout, and everything
  // that describes the *drawable* geometry regardless of what is selected.
  // The cache is a ref rather than a second memo because `enabled` is in the
  // dependency list: without it, closing the schematic would evict the layout
  // and re-deriving it would be the price of every return trip.
  const cacheRef = useRef<{
    cityData: CityData;
    strategy: SchematicLayoutStrategy;
    value: SchematicBase;
  } | null>(null);

  const base = useMemo<SchematicBase | null>(() => {
    if (cityData === null) return null;
    const cached = cacheRef.current;
    if (cached?.cityData === cityData && cached.strategy === strategy) {
      return cached.value;
    }
    if (!enabled) return null;
    const network = deriveTransitNetwork(cityData);
    const layout = strategy(network);

    // Available lines are the intersection of "draws a stroke" and "has
    // metadata": the diagram's colour comes from the stroke, the name and the
    // mode from the line.
    const drawnColors = new Map<string, string>();
    for (const segment of layout.segments) {
      if (!drawnColors.has(segment.lineId)) {
        drawnColors.set(segment.lineId, segment.color);
      }
    }
    const lines = [...drawnColors.entries()]
      .flatMap(([lineId, color]) => {
        const info = network.lines.get(lineId);
        if (!info) return [];
        const name = info.name.trim();
        return [
          {
            lineId,
            color,
            mode: info.mode,
            name: name.length > 0 ? name : null,
          },
        ];
      })
      // Deterministic reading order: named lines alphabetically, then the
      // unnamed ones, with the internal id only ever breaking ties.
      .sort((a, b) => {
        if (a.name !== b.name) {
          if (a.name === null) return 1;
          if (b.name === null) return -1;
          return a.name.localeCompare(b.name);
        }
        return a.lineId < b.lineId ? -1 : a.lineId > b.lineId ? 1 : 0;
      });

    const drawnModes = new Set(lines.map((line) => line.mode));
    const value: SchematicBase = {
      layout,
      lines,
      availableModes: TOGGLABLE_TRANSIT_MODES.filter((mode) =>
        drawnModes.has(mode),
      ),
    };
    cacheRef.current = { cityData, strategy, value };
    return value;
  }, [cityData, strategy, enabled]);

  // The value-identity of `hiddenModes`: a fresh array with the same contents
  // must not count as a change and re-project a layout that did not move.
  const hiddenKey = [...hiddenModes].sort().join('|');

  return useMemo<SchematicNetworkModel>(() => {
    if (base === null || isSchematicLayoutEmpty(base.layout)) {
      return EMPTY_SCHEMATIC_MODEL;
    }

    // `Unknown` has no label and no switch, so it can never be hidden; only a
    // mode that still has a control can be.
    const hidden = new Set(
      base.availableModes.filter((mode) => hiddenModes.includes(mode)),
    );
    const visibleLines = base.lines.filter((line) => !hidden.has(line.mode));
    const layout = filterSchematicLayout(
      base.layout,
      visibleLines.map((line) => line.lineId),
    );

    const legend = TRANSIT_MODES.flatMap((mode) => {
      const lines = visibleLines
        .filter((line) => line.mode === mode)
        .map(({ lineId, name, color }) => ({ lineId, name, color }));
      return lines.length > 0 ? [{ mode, lines }] : [];
    });

    return {
      layout,
      hasDrawableNetwork: true,
      isFilteredEmpty: isSchematicLayoutEmpty(layout),
      availableModes: base.availableModes,
      hiddenModes: hidden,
      legend,
      visibleLineCount: visibleLines.length,
      hasVisibleStations: layout.stations.length > 0,
    };
    // DEPENDENCIES ARE INTENTIONALLY INCOMPLETE. `hiddenModes` is read above
    // but deliberately absent here: the caller holds the selection in a
    // reducer and hands over a fresh array on every render, so depending on it
    // would re-project continuously and make `hiddenKey` — which exists
    // precisely to give that array identity by value — inert. `hiddenKey` is
    // derived from exactly the contents this block reads, so it is a complete
    // substitute; adding `hiddenModes` back is what the test "re-projects only
    // when the selection really changed" fails on. (No `eslint-disable` here:
    // this repo registers no `react-hooks` plugin, so naming that rule is
    // itself a lint error.)
  }, [base, hiddenKey]);
}
