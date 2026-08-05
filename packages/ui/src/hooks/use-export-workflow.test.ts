import { describe, expect, it } from 'vitest';
import type { ExportPresentationOptions } from '@vellum/core';
import { unsupportedSvgPresentationOptions } from './use-export-workflow';

const ALL_OFF: ExportPresentationOptions = {
  showCityName: false,
  showVellumLogo: false,
  showSourceFile: false,
  showGeneratedAt: false,
  showDistrictNames: false,
  showParkNames: false,
  showLayerLegend: false,
  showRoadLegend: false,
  showTransitLegend: false,
  showElevationLegend: false,
  showScaleBar: false,
  showOrientation: false,
  showSummary: false,
};

describe('unsupportedSvgPresentationOptions', () => {
  it('reports nothing when the user enabled nothing the MVP cannot render', () => {
    expect(unsupportedSvgPresentationOptions(ALL_OFF)).toEqual([]);
  });

  it('names every enabled option the MVP will not apply', () => {
    // AC 14: an unrepresentable option is surfaced, never silently ignored.
    expect(
      unsupportedSvgPresentationOptions({
        ...ALL_OFF,
        showCityName: true,
        showScaleBar: true,
      }),
    ).toEqual(['showCityName', 'showScaleBar']);
  });

  it('covers the whole presentation contract, so a new option cannot slip through unreported', () => {
    const allOn = Object.fromEntries(
      Object.keys(ALL_OFF).map((key) => [key, true]),
    ) as unknown as ExportPresentationOptions;
    expect(unsupportedSvgPresentationOptions(allOn).sort()).toEqual(
      Object.keys(ALL_OFF).sort(),
    );
  });
});
