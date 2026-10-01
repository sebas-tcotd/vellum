/**
 * Opt-in profile of the schematic camera on a real city (Story 4.5).
 *
 * Skipped unless `VELLUM_PROFILE_CITY` points at a `CityData` JSON dumped with
 * `cargo run --release --example dump_city --package parser-cslmap`. It times,
 * per gesture step, the two costs JavaScript controls: React reconciling the
 * SVG and the geometry/label pass a zoom step triggers. It also times what a
 * gesture costs once it ends — the pan's commit on release and the zoom's
 * settle — since that is where Story 4.5 moved the work. Browser paint is not
 * measurable here; that is the manual check on the Windows machine.
 *
 * ```bash
 * cargo run --release --example dump_city --package parser-cslmap -- \
 *     research/vellum-bridge/cslmap/san-rico-20260922-181024.cslmap /tmp/san-rico.json
 * VELLUM_PROFILE_CITY=/tmp/san-rico.json pnpm --filter @vellum/ui exec vitest run SchematicView.profile --silent=false
 * ```
 *
 * PowerShell (the Windows machine):
 *
 * ```powershell
 * $env:VELLUM_PROFILE_CITY = "$env:TEMP\san-rico.json"; pnpm --filter @vellum/ui exec vitest run SchematicView.profile --silent=false
 * ```
 */
import { readFileSync } from 'node:fs';
import { act, renderHook } from '@testing-library/react';
import {
  octilinearSchematicLayout,
  placeSchematicLabels,
  rematerializeSchematicLayout,
  type CityData,
} from '@vellum/core';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../test-utils';
import { useSchematicNetwork } from '../../hooks/use-schematic-network';
import { SchematicView } from './SchematicView';
import { ZOOM_SETTLE_MS } from './use-schematic-camera';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const cityPath = process.env.VELLUM_PROFILE_CITY;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const ms = (value: number): string => `${value.toFixed(2)} ms`;

describe.skipIf(!cityPath)('SchematicView profile', () => {
  it('times reconciliation and the zoom-step pass on a real city', () => {
    vi.useFakeTimers({
      toFake: [
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'setTimeout',
        'clearTimeout',
      ],
    });
    const city = JSON.parse(readFileSync(cityPath!, 'utf8')) as CityData;
    const model = renderHook(() =>
      useSchematicNetwork({
        cityData: city,
        hiddenModes: [],
        strategy: octilinearSchematicLayout,
        layoutId: 'octilinear',
      }),
    ).result.current;
    const { layout, labelSources } = model;

    // The zoom-step pass, outside React: what crossing one quantum costs.
    const pass: number[] = [];
    for (const scale of [1, 2 ** -0.25, 2 ** -0.5, 2 ** -0.75, 0.5]) {
      const start = performance.now();
      const rendered = rematerializeSchematicLayout(layout, scale);
      placeSchematicLabels(
        rendered,
        labelSources.lines,
        labelSources.stations,
        { scale },
      );
      pass.push(performance.now() - start);
    }

    render(
      <SchematicView
        model={model}
        onBack={() => {}}
        onShowAllModes={() => {}}
      />,
    );
    const svg = screen.getByTestId('schematic-diagram');
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1600,
      height: 900,
    } as DOMRect);
    const flushFrame = () => vi.advanceTimersToNextFrame();

    // A pan: one pointermove per frame, as the browser delivers them.
    const pan: number[] = [];
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 800, clientY: 450 });
    for (let step = 1; step <= 30; step += 1) {
      const start = performance.now();
      act(() => {
        fireEvent.pointerMove(svg, {
          pointerId: 1,
          clientX: 800 + step * 4,
          clientY: 450,
        });
        flushFrame();
      });
      pan.push(performance.now() - start);
    }
    // The release commits the camera to React: once per pan gesture.
    let start = performance.now();
    act(() => {
      fireEvent.pointerUp(svg, { pointerId: 1 });
    });
    const panRelease = performance.now() - start;

    // A zoom: wheel ticks, each a frame, each crossing about one quantum.
    const zoom: number[] = [];
    for (let step = 0; step < 12; step += 1) {
      start = performance.now();
      act(() => {
        fireEvent.wheel(svg, { clientX: 800, clientY: 450, deltaY: -1 });
        flushFrame();
      });
      zoom.push(performance.now() - start);
    }
    // The wheel rests: the new scale is committed, rematerialized and labelled
    // — once per zoom gesture.
    start = performance.now();
    act(() => {
      vi.advanceTimersByTime(ZOOM_SETTLE_MS);
    });
    const zoomSettle = performance.now() - start;
    vi.useRealTimers();

    const counts = {
      segments: layout.segments.length,
      connectors: layout.connectors.length,
      stations: layout.stations.length,
      lines: labelSources.lines.length,
    };
    process.stdout.write(
      [
        `schematic profile — ${JSON.stringify(counts)}`,
        `zoom-step pass (rematerialize + labels): median ${ms(median(pass))}, max ${ms(Math.max(...pass))}`,
        `pan step (event → commit):  median ${ms(median(pan))}, max ${ms(Math.max(...pan))}`,
        `zoom step (event → commit): median ${ms(median(zoom))}, max ${ms(Math.max(...zoom))}`,
        `pan release (commit, once per gesture): ${ms(panRelease)}`,
        `zoom settle (rescale, once per gesture): ${ms(zoomSettle)}`,
        '',
      ].join('\n'),
    );
    expect(pan.length).toBe(30);
  }, 120_000);
});
