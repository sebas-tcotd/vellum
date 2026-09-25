/**
 * Transit pipeline GeoJSON construction: derives the canonical
 * `TransitNetwork` projection once via `deriveTransitNetwork` (`@vellum/core`
 * — line graph, MLNCM-S ordering, stop/transfer semantics), builds the render
 * geometry from it (trims, inner connections, stations), and converts the
 * result to GeoJSON. See `@vellum/core`'s canonical `transit-network` module
 * for the methodology references.
 */

import {
  deriveTransitNetwork,
  type CityData,
  type ConnectorGeometry,
  type CorridorGeometry,
  type StationGeometry,
  type TransitNetwork,
} from '@vellum/core';
import { csToGeoArray } from '../../coordinate-transform';
import type {
  StationDotFeature,
  TransitFeature,
  TransitFeatureCollection,
  TransitRenderData,
  TransitStopFeature,
  TransitStopsFeatureCollection,
} from '../types';
import { calculatePolygonCentroid } from '../utils/geometry.helpers';

/**
 * Runs the full transit pipeline and converts its output to GeoJSON.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns Line, connector, and station FeatureCollections for MapLibre.
 */
export function buildTransitRenderData(cityData: CityData): TransitRenderData {
  const network = deriveTransitNetwork(cityData);
  const geometry = network.renderGeometry;
  const names = stopNames(cityData);

  return {
    lines: {
      type: 'FeatureCollection',
      features: createLineFeatures(geometry.corridors, network),
    },
    connectors: {
      type: 'FeatureCollection',
      features: createConnectorFeatures(geometry.connectors, network),
    },
    stations: {
      type: 'FeatureCollection',
      features: createStationFeatures(geometry.stations, names),
    },
    stationDots: {
      type: 'FeatureCollection',
      features: createStationDotFeatures(geometry.stations, names),
    },
    transferMarkers: {
      type: 'FeatureCollection',
      features: createStationDotFeatures(
        geometry.stations.filter((s) => s.confirmedTransfer),
        names,
      ),
    },
  };
}

/**
 * Builds the transit-line FeatureCollection (corridor centerlines with
 * `offsetIdx` for `line-offset` rendering).
 *
 * @remarks
 * Thin wrapper over {@link buildTransitRenderData}; prefer that function when
 * the connector and station collections are also needed: each call derives the
 * whole network again (no caching, by design).
 */
export function buildTransitGeoJson(
  cityData: CityData,
): TransitFeatureCollection {
  return buildTransitRenderData(cityData).lines;
}

/**
 * Builds the station-polygon FeatureCollection (paper §5.4 adapted to CSLMap:
 * proximity-grouped stops rendered as rotated rectangles across only the
 * corridor slots whose lines actually stop there).
 *
 * @remarks
 * Thin wrapper over {@link buildTransitRenderData}; prefer that function when
 * the line and connector collections are also needed.
 */
export function buildTransitStopsGeoJson(
  cityData: CityData,
): TransitStopsFeatureCollection {
  return buildTransitRenderData(cityData).stations;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function createLineFeatures(
  corridors: readonly CorridorGeometry[],
  network: TransitNetwork,
): TransitFeature[] {
  const features: TransitFeature[] = [];

  for (const corridor of corridors) {
    const coordinates: [number, number][] = corridor.path.map((pt) =>
      csToGeoArray(pt),
    );
    for (const slot of corridor.slots) {
      const info = network.lines.get(slot.lineId);
      if (!info) continue;

      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {
          id: info.id,
          color: info.color,
          mode: info.mode,
          offsetIdx: slot.offsetIndex,
        },
      });
    }
  }
  return features;
}

function createConnectorFeatures(
  connectors: readonly ConnectorGeometry[],
  network: TransitNetwork,
): TransitFeature[] {
  return connectors.flatMap((conn) => {
    const info = network.lines.get(conn.lineId);
    if (!info) return [];

    return [
      {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: conn.path.map((pt) => csToGeoArray(pt)),
        },
        properties: {
          id: info.id,
          color: info.color,
          mode: info.mode,
          offsetIdx: 0,
        },
      },
    ];
  });
}

/** A stop's name and whether it was derived from its street. */
interface StopName {
  readonly name: string;
  readonly derived: boolean;
}

/**
 * Named stops by id. Only native documents name stops; a `.cslmap` yields an
 * empty map and its stations keep the name-less tooltip.
 */
function stopNames(cityData: CityData): Map<string, StopName> {
  const names = new Map<string, StopName>();
  for (const line of cityData.transitLines) {
    for (const stop of line.stops) {
      const name = stop.name.trim();
      if (name && !names.has(stop.id)) {
        names.set(stop.id, { name, derived: stop.nameDerived === true });
      }
    }
  }
  return names;
}

/**
 * The name properties of a station, keyed by its first member stop (the
 * `stopId` part of the `stopId:corridorId` station id). Omitted — not
 * `undefined` — when the stop has no name, so MapLibre sees no property.
 */
function stationNameProperties(
  station: StationGeometry,
  names: ReadonlyMap<string, StopName>,
): Pick<TransitStopFeature['properties'], 'name' | 'nameDerived'> {
  // Cut at the *first* colon: corridor ids contain colons themselves
  // (`c:<segment>`), stop ids are colon-free CS1 node ids.
  const colon = station.id.indexOf(':');
  const stopId = colon < 0 ? station.id : station.id.slice(0, colon);
  const found = names.get(stopId);
  return found ? { name: found.name, nameDerived: found.derived } : {};
}

function createStationFeatures(
  stations: readonly StationGeometry[],
  names: ReadonlyMap<string, StopName>,
): TransitStopFeature[] {
  return stations.map((station) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [station.polygon.map((pt) => csToGeoArray(pt))],
    },
    properties: {
      id: station.id,
      mode: station.lines[0]?.mode ?? 'Unknown',
      color: station.lines[0]?.color ?? '#ffffff',
      lines: JSON.stringify(station.lines),
      ...stationNameProperties(station, names),
    },
  }));
}

function createStationDotFeatures(
  stations: readonly StationGeometry[],
  names: ReadonlyMap<string, StopName>,
): StationDotFeature[] {
  return stations.map((station) => {
    const centroid = calculatePolygonCentroid(station.polygon.slice(0, -1));
    return {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: csToGeoArray(centroid) },
      properties: {
        id: station.id,
        mode: station.lines[0]?.mode ?? 'Unknown',
        color: station.lines[0]?.color ?? '#ffffff',
        lines: JSON.stringify(station.lines),
        ...stationNameProperties(station, names),
      },
    };
  });
}
