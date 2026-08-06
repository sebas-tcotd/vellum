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

/** Everything the SVG writer genuinely has no output for. */
const NEVER_RENDERED = [
  'showCityName',
  'showSourceFile',
  'showGeneratedAt',
  'showLayerLegend',
  'showRoadLegend',
  'showTransitLegend',
  'showElevationLegend',
  'showScaleBar',
  'showOrientation',
  'showSummary',
] as const;

/**
 * Options 6.3B gave the exporter real output for.
 *
 * @remarks
 * The document draws these; it just decides *when* from the layer toggles
 * rather than from the dialog. Reporting them as unsupported was a leftover
 * from the 6.3A MVP and told the user the opposite of what the file contains.
 */
const RENDERED_SINCE_6_3B = [
  'showVellumLogo',
  'showDistrictNames',
  'showParkNames',
] as const;

describe('unsupportedSvgPresentationOptions', () => {
  it('reports nothing when the user enabled nothing the MVP cannot render', () => {
    expect(unsupportedSvgPresentationOptions(ALL_OFF)).toEqual([]);
  });

  it('names every enabled option the exporter will not apply', () => {
    // AC 14: an unrepresentable option is surfaced, never silently ignored.
    expect(
      unsupportedSvgPresentationOptions({
        ...ALL_OFF,
        showCityName: true,
        showScaleBar: true,
      }),
    ).toEqual(['showCityName', 'showScaleBar']);
  });

  it('stays silent about the annotations 6.3B actually made the exporter draw', () => {
    // The emblem comes from `SceneEmblem`, the names from
    // `buildSceneAnnotations` — warning about them contradicted the file the
    // user was looking at.
    const enabled = Object.fromEntries(
      RENDERED_SINCE_6_3B.map((key) => [key, true]),
    );
    expect(
      unsupportedSvgPresentationOptions({ ...ALL_OFF, ...enabled }),
    ).toEqual([]);
  });

  it('still reports the city name, whose only output is document metadata', () => {
    // `<title>` makes the name available to a screen reader and a browser tab,
    // but the user asked for a caption on the map and there is none.
    expect(
      unsupportedSvgPresentationOptions({ ...ALL_OFF, showCityName: true }),
    ).toEqual(['showCityName']);
  });

  it('covers the whole presentation contract, so a new option cannot slip through unreported', () => {
    // Every key is either genuinely unrenderable or knowingly rendered —
    // a freshly added option belongs to one list or the other, never neither.
    expect([...NEVER_RENDERED, ...RENDERED_SINCE_6_3B].sort()).toEqual(
      Object.keys(ALL_OFF).sort(),
    );

    const allOn = Object.fromEntries(
      Object.keys(ALL_OFF).map((key) => [key, true]),
    ) as unknown as ExportPresentationOptions;
    expect(unsupportedSvgPresentationOptions(allOn).sort()).toEqual(
      [...NEVER_RENDERED].sort(),
    );
  });
});
