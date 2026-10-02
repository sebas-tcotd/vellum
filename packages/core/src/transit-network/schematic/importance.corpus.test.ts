/**
 * Opt-in corpus evidence for the routing order by urban importance (Story
 * 4.7, ADR-0007).
 *
 * Skipped unless `VELLUM_IMPORTANCE_CITY` points at a `CityData` JSON dumped
 * with `cargo run --release --example dump_city --package parser-cslmap` from a
 * `.vellummap` or `.cslmap`. It lays the city out octilinearly twice — with
 * the order from before Story 4.7 (one layer, heaviest corridor first) and with
 * the layers by routing rank — prints the bends per mode of both, and asserts that
 * the lines on rails (metro, train, monorail, tram) bend less in total.
 *
 * ```bash
 * cargo run --release --example dump_city --package parser-cslmap -- \
 *     "San Rico 2026-10-02 120343.vellummap" /tmp/san-rico.json
 * VELLUM_IMPORTANCE_CITY=/tmp/san-rico.json pnpm --filter @vellum/core exec vitest run importance.corpus --silent=false
 * ```
 *
 * PowerShell:
 *
 * ```powershell
 * $env:VELLUM_IMPORTANCE_CITY = "$env:TEMP\san-rico.json"; pnpm --filter @vellum/core exec vitest run importance.corpus --silent=false
 * ```
 */
import { describe, expect, it } from 'vitest';
import type { CityData, TransitMode } from '../../types/city-data';
import { gridSchematicLayout } from './grid-layout';
import { tramRoutesFirst } from './importance';
import { countBendsByMode } from './metrics';
import { createOctilinearGrid, octilinearSchematicLayout } from './octilinear';
import { deriveSchematicTransitNetwork } from './station-contraction';

// `@vellum/core` builds without Node types, so the two Node facilities this
// opt-in test needs are reached without naming them in a type position.
interface NodeLike {
  readonly process?: {
    readonly env: Record<string, string | undefined>;
    readonly stdout: { write(text: string): void };
  };
}
const nodeProcess = (globalThis as NodeLike).process;
const cityPath = nodeProcess?.env.VELLUM_IMPORTANCE_CITY;

async function readCity(path: string): Promise<CityData> {
  const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as {
    readFileSync(path: string, encoding: 'utf8'): string;
  };
  return JSON.parse(fs.readFileSync(path, 'utf8')) as CityData;
}

/** Modes on rails: the ones Story 4.7 wants straighter. */
const RAIL_MODES: readonly TransitMode[] = [
  'Metro',
  'Train',
  'Monorail',
  'Tram',
];

const railBends = (bends: Readonly<Record<string, number>>): number =>
  RAIL_MODES.reduce((sum, mode) => sum + (bends[mode] ?? 0), 0);

describe.skipIf(!cityPath)('routing order by importance on a real city', () => {
  it('bends the rails less than the order by weight', async () => {
    const city = await readCity(cityPath as string);
    const network = deriveSchematicTransitNetwork(city);

    const linesByMode: Record<string, number> = {};
    for (const line of network.lines.values()) {
      linesByMode[line.mode] = (linesByMode[line.mode] ?? 0) + 1;
    }

    const byWeight = gridSchematicLayout(network, createOctilinearGrid, {
      routingOrder: 'weight',
    });
    const byImportance = octilinearSchematicLayout(network);
    const before = countBendsByMode(network, byWeight);
    const after = countBendsByMode(network, byImportance);

    const modes = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .sort()
      .map((mode) => [mode, `${before[mode] ?? 0} → ${after[mode] ?? 0}`]);
    const total = (bends: Readonly<Record<string, number>>) =>
      Object.values(bends).reduce((sum, n) => sum + n, 0);
    const report = {
      city: city.cityName,
      lines: linesByMode,
      tramRoutesFirst: tramRoutesFirst(network.lines.values()),
      bendsByMode: Object.fromEntries(modes),
      railBends: `${railBends(before)} → ${railBends(after)}`,
      allBends: `${total(before)} → ${total(after)}`,
    };
    nodeProcess?.stdout.write(`${JSON.stringify(report, null, 2)}
`);

    // Determinism: the same network lays out the same way again.
    expect(octilinearSchematicLayout(network)).toEqual(byImportance);
    expect(railBends(after)).toBeLessThan(railBends(before));
    // Three octilinear layouts of a real city: San Rico takes a while.
  }, 300_000);
});
