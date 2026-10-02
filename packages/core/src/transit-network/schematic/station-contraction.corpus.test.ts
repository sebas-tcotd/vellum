/**
 * Opt-in corpus evidence for the station contraction (Story 4.6).
 *
 * Skipped unless `VELLUM_CONTRACTION_CITY` points at a `CityData` JSON dumped
 * with `cargo run --release --example dump_city --package parser-cslmap` from a
 * `.vellummap` that carries `stationId` (Vellum Bridge, `transit` 1.1). It
 * compares the network and the drawn symbols before and after the contraction,
 * prints the figures, and asserts that every station is one symbol and that no
 * corridor is left inside a station.
 *
 * ```bash
 * cargo run --release --example dump_city --package parser-cslmap -- \
 *     "Costa Tijuca 2026-10-01 171705.vellummap" /tmp/costa-tijuca.json
 * VELLUM_CONTRACTION_CITY=/tmp/costa-tijuca.json pnpm --filter @vellum/core exec vitest run station-contraction.corpus --silent=false
 * ```
 *
 * PowerShell:
 *
 * ```powershell
 * $env:VELLUM_CONTRACTION_CITY = "$env:TEMP\costa-tijuca.json"; pnpm --filter @vellum/core exec vitest run station-contraction.corpus --silent=false
 * ```
 */
import { describe, expect, it } from 'vitest';
import type { CityData } from '../../types/city-data';
import type { TransitNetwork } from '../../types/transit-network';
import { deriveTransitNetwork } from '../derive';
import { byString, type SchematicLayout } from './contract';
import { geographicSchematicLayout } from './geographic';
import { octilinearSchematicLayout } from './octilinear';
import {
  contractSchematicStations,
  STATION_CONTRACTION_RADIUS_M,
} from './station-contraction';

// `@vellum/core` builds without Node types, so the two Node facilities this
// opt-in test needs are reached without naming them in a type position.
interface NodeLike {
  readonly process?: {
    readonly env: Record<string, string | undefined>;
    readonly stdout: { write(text: string): void };
  };
}
const nodeProcess = (globalThis as NodeLike).process;
const cityPath = nodeProcess?.env.VELLUM_CONTRACTION_CITY;

async function readCity(path: string): Promise<CityData> {
  const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as {
    readFileSync(path: string, encoding: 'utf8'): string;
  };
  return JSON.parse(fs.readFileSync(path, 'utf8')) as CityData;
}

/**
 * Drawn symbols per `stationId`, counted from `layout.stations`: each drawn
 * symbol is traced back to the placed stops it stands for (its own, plus every
 * placed stop sharing its `stationKey`, which the rendering stage merged into
 * it), and each placed stop to the stations of its candidate's entries. Every
 * station of `stationIds` is in the result, so a station drawn with no symbol
 * reads as `0`.
 */
function symbolsPerStation(
  network: TransitNetwork,
  layout: SchematicLayout,
  stationOfStop: ReadonlyMap<string, string>,
  stationIds: ReadonlySet<string>,
): Map<string, number> {
  const drawnLines = new Set(layout.segments.map((s) => s.lineId));
  // Placed stop id → the stations its candidate covers. The id is the one
  // `canonicalSchematicStops` gives it: the smallest drawn, finite stop id.
  const stationsOfPlaced = new Map<string, Set<string>>();
  for (const candidate of network.transferCandidates) {
    const entries = candidate.stops.filter(
      (s) =>
        drawnLines.has(s.lineId) &&
        Number.isFinite(s.position.x) &&
        Number.isFinite(s.position.z),
    );
    const id = entries.map((s) => s.stopId).sort(byString)[0];
    if (id === undefined) continue;
    const covered = stationsOfPlaced.get(id) ?? new Set<string>();
    for (const entry of entries) {
      const stationId = stationOfStop.get(entry.stopId);
      if (stationId !== undefined) covered.add(stationId);
    }
    stationsOfPlaced.set(id, covered);
  }
  const placed = layout.presentationInput?.stops ?? [];
  const keyOf = new Map(placed.map((stop) => [stop.id, stop.stationKey]));

  const counts = new Map([...stationIds].map((id) => [id, 0]));
  for (const symbol of layout.stations) {
    const key = keyOf.get(symbol.id);
    const members =
      key === undefined
        ? [symbol.id]
        : placed.filter((p) => p.stationKey === key).map((p) => p.id);
    const covered = new Set(
      members.flatMap((id) => [...(stationsOfPlaced.get(id) ?? [])]),
    );
    for (const stationId of covered) {
      counts.set(stationId, (counts.get(stationId) ?? 0) + 1);
    }
  }
  return counts;
}

describe.skipIf(!cityPath)('station contraction on a real city', () => {
  it('leaves one symbol per station and no corridor inside one', async () => {
    const city = await readCity(cityPath as string);
    const contracted = contractSchematicStations(city);
    expect(contracted).not.toBe(city);

    // The baseline is the diagram before Story 4.6: no contraction and no
    // station keys, so nothing is merged.
    const stationOfStop = new Map<string, string>();
    for (const line of city.transitLines) {
      for (const stop of line.stops) {
        if (stop.stationId) stationOfStop.set(stop.id, stop.stationId);
      }
    }
    const baseline: CityData = {
      ...city,
      transitLines: city.transitLines.map((line) => ({
        ...line,
        stops: line.stops.map(({ stationId: _drop, ...stop }) => stop),
      })),
    };
    const before = deriveTransitNetwork(baseline);
    const after = deriveTransitNetwork(contracted);

    const centralNodes = contracted.roadNodes.filter((n) =>
      n.id.startsWith('station:'),
    );
    const centresPerStation = new Map<string, number>();
    for (const node of centralNodes) {
      const stationId = node.id.split(':')[1];
      centresPerStation.set(
        stationId,
        (centresPerStation.get(stationId) ?? 0) + 1,
      );
    }
    const stationIds = new Set(
      city.transitLines.flatMap((line) =>
        line.stops.flatMap((s) => (s.stationId ? [s.stationId] : [])),
      ),
    );

    const report: Record<string, unknown> = {
      city: city.cityName,
      stations: stationIds.size,
      nodes: `${before.nodes.size} → ${after.nodes.size}`,
      corridors: `${before.edges.size} → ${after.edges.size}`,
      centralNodes: centralNodes.length,
      stationsWithSeveralCentres: [...centresPerStation.values()].filter(
        (n) => n > 1,
      ).length,
    };

    for (const [name, strategy] of [
      ['geographic', geographicSchematicLayout],
      ['octilinear', octilinearSchematicLayout],
    ] as const) {
      const layoutBefore = strategy(before);
      const layoutAfter = strategy(after);
      const symbolsBefore = symbolsPerStation(
        before,
        layoutBefore,
        stationOfStop,
        stationIds,
      );
      const symbolsAfter = symbolsPerStation(
        after,
        layoutAfter,
        stationOfStop,
        stationIds,
      );
      const several = (m: Map<string, number>) =>
        [...m.values()].filter((n) => n > 1).length;
      const total = (m: Map<string, number>) =>
        [...m.values()].reduce((sum, n) => sum + n, 0);
      report[name] = {
        symbols: `${layoutBefore.stations.length} → ${layoutAfter.stations.length}`,
        stationsWithSeveralSymbols: `${several(symbolsBefore)} → ${several(symbolsAfter)}`,
        symbolsOfStations: `${total(symbolsBefore)} → ${total(symbolsAfter)}`,
      };
      // Exactly one drawn symbol per station: none is as wrong as two.
      const notOne = [...symbolsAfter].filter(([, n]) => n !== 1);
      expect(notOne, `${name}: stations not drawn as one symbol`).toEqual([]);
    }

    // No corridor left inside a station: a corridor whose two ends are the
    // same central node must leave the station's reach somewhere.
    const centreById = new Map(centralNodes.map((n) => [n.id, n]));
    const inside = [...after.edges.values()].filter((edge) => {
      if (edge.nodeA !== edge.nodeB) return false;
      const centre = centreById.get(edge.nodeA);
      if (centre === undefined) return false;
      return edge.path.every(
        (p) =>
          Math.hypot(p.x - centre.position.x, p.z - centre.position.z) <=
          2 * STATION_CONTRACTION_RADIUS_M,
      );
    });
    report.corridorsInsideAStation = inside.length;
    nodeProcess?.stdout.write(`${JSON.stringify(report, null, 2)}
`);

    expect(inside.map((e) => e.id)).toEqual([]);
    expect(after.nodes.size).toBeLessThan(before.nodes.size);
    // Two layouts per strategy of a real city: San Rico takes about 10 s.
  }, 120_000);
});
