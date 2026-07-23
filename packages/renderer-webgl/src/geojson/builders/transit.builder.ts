/**
 * Transit pipeline GeoJSON construction: runs line graph construction (with
 * corridor contraction and Lemma-4.1 bundling), MLNCM-S line ordering, and
 * render geometry (trims, inner connections, stations), then converts the
 * result to GeoJSON. See the modules under `../../transit/` for the
 * methodology references.
 */

import type { CityData } from '@vellum/core';
import { csToGeoArray } from '../../coordinate-transform';
import type { TransitLineGraph } from '../../transit/line-graph';
import { buildTransitLineGraph } from '../../transit/line-graph';
import { computeLineOrder } from '../../transit/ordering';
import type {
  ConnectorGeometry,
  CorridorGeometry,
  StationGeometry,
} from '../../transit/render-geometry';
import { buildRenderGeometry } from '../../transit/render-geometry';
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
  const graph = buildTransitLineGraph(cityData);
  const { lineOrder } = computeLineOrder(graph);
  const geometry = buildRenderGeometry(graph, lineOrder, cityData);

  return {
    lines: {
      type: 'FeatureCollection',
      features: createLineFeatures(geometry.corridors, graph),
    },
    connectors: {
      type: 'FeatureCollection',
      features: createConnectorFeatures(geometry.connectors, graph),
    },
    stations: {
      type: 'FeatureCollection',
      features: createStationFeatures(geometry.stations),
    },
    stationDots: {
      type: 'FeatureCollection',
      features: createStationDotFeatures(geometry.stations),
    },
  };
}

/**
 * Builds the transit-line FeatureCollection (corridor centerlines with
 * `offsetIdx` for `line-offset` rendering).
 *
 * @remarks
 * Thin wrapper over {@link buildTransitRenderData}; prefer that function when
 * the connector and station collections are also needed, to avoid running the
 * ordering pipeline three times.
 */
export function buildTransitGeoJson(
  cityData: CityData,
): TransitFeatureCollection {
  return buildTransitRenderData(cityData).lines;
}

/**
 * Builds the station-polygon FeatureCollection (paper §5.4 adapted to CSLMap:
 * proximity-grouped stops rendered as rotated rectangles across their
 * corridor's full bundle width).
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
  corridors: CorridorGeometry[],
  graph: TransitLineGraph,
): TransitFeature[] {
  const features: TransitFeature[] = [];

  for (const corridor of corridors) {
    const coordinates: [number, number][] = corridor.path.map((pt) =>
      csToGeoArray(pt),
    );
    const n = corridor.lineIds.length;

    for (let p = 0; p < n; p++) {
      const info = graph.lines.get(corridor.lineIds[p]);
      if (!info) continue;

      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {
          id: info.id,
          color: info.color,
          mode: info.mode,
          offsetIdx: p - (n - 1) / 2, // SLAP: Formula para el offset de MapLibre
        },
      });
    }
  }
  return features;
}

function createConnectorFeatures(
  connectors: ConnectorGeometry[],
  graph: TransitLineGraph,
): TransitFeature[] {
  return connectors.flatMap((conn) => {
    const info = graph.lines.get(conn.lineId);
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

function createStationFeatures(
  stations: StationGeometry[],
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
    },
  }));
}

function createStationDotFeatures(
  stations: StationGeometry[],
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
      },
    };
  });
}
