import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CityData,
  ExportPreviewOptions,
  ExportPreviewSnapshot,
} from '@vellum/core';
import { useVellumStore } from '../store/vellum-store';
import {
  unsupportedSvgPresentationOptions,
  useExportWorkflow,
} from './use-export-workflow';

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

/** Minimal city stand-in: the hook only ever compares it by reference. */
const CITY = { cityName: 'Altavento' } as unknown as CityData;

function previewNamed(label: string): ExportPreviewSnapshot {
  return {
    dataUrl: `data:image/png;base64,${label}`,
    width: 640,
    height: 480,
    bearingDegrees: 0,
    scale: { distanceMeters: 500, widthPercent: 20 },
    annotations: [],
  };
}

/**
 * Mounts the workflow over a controllable capture.
 *
 * @remarks
 * Each capture resolves only when the test says so, which is what makes a
 * late result — one the user has already moved past — reproducible instead of
 * a timing accident.
 */
function setupWorkflow() {
  const calls: {
    options: ExportPreviewOptions;
    resolve: (value: ExportPreviewSnapshot | null) => void;
  }[] = [];
  const capture = vi.fn((options: ExportPreviewOptions) => {
    return new Promise<ExportPreviewSnapshot | null>((resolve) => {
      calls.push({ options, resolve });
    });
  });
  const previewCaptureRef = { current: capture };
  const snapshotCaptureRef = { current: null };
  const view = renderHook(() =>
    useExportWorkflow({
      cityData: CITY,
      loadingState: 'idle',
      previewCaptureRef,
      snapshotCaptureRef,
      isExportingProp: false,
    }),
  );

  /**
   * Opens the dialog the way the UI does.
   *
   * @remarks
   * `handleOpenExport` only opens; the composition is `ExportDialog`'s, and it
   * asks for the first preview itself through the same entry point every later
   * recapture uses. Mirroring that here keeps these tests honest about the
   * sequence the app actually runs.
   */
  const openDialog = (): void => {
    act(() => view.result.current.handleOpenExport());
    act(() =>
      view.result.current.handleRecapturePreview({
        area: 'viewport',
        background: 'white',
      }),
    );
  };
  return { view, calls, capture, openDialog };
}

describe('useExportWorkflow preview recapture', () => {
  beforeEach(() => {
    useVellumStore.setState({ cityData: CITY, loadingState: 'idle' });
  });

  it('captures the opening composition through the same snapshot path', async () => {
    const { view, calls, openDialog } = setupWorkflow();

    openDialog();

    // The first preview is a real capture of a stated composition, not a
    // cheaper read of the live canvas: opening the dialog cannot show
    // something the file would not produce.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options).toEqual({
      area: 'viewport',
      background: 'white',
    });
    await act(async () => calls[0]!.resolve(previewNamed('open')));
    expect(view.result.current.exportPreview?.dataUrl).toContain('open');
  });

  it('opening the dialog on its own captures nothing', () => {
    const { view, calls } = setupWorkflow();

    act(() => view.result.current.handleOpenExport());

    // `handleOpenExport` does not guess the composition — the dialog owns
    // `area`/`background`, and a guess is how preview and file drift apart.
    expect(view.result.current.isExportDialogOpen).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('recaptures with the options the dialog now describes', async () => {
    const { view, calls, openDialog } = setupWorkflow();
    openDialog();
    await act(async () => calls[0]!.resolve(previewNamed('open')));

    act(() =>
      view.result.current.handleRecapturePreview({
        area: 'full-map',
        background: 'transparent',
      }),
    );

    expect(calls[1]!.options).toEqual({
      area: 'full-map',
      background: 'transparent',
    });
    await act(async () => calls[1]!.resolve(previewNamed('full-map')));
    expect(view.result.current.exportPreview?.dataUrl).toContain('full-map');
  });

  it('discards a recapture the user has already superseded', async () => {
    const { view, calls, openDialog } = setupWorkflow();
    openDialog();
    await act(async () => calls[0]!.resolve(previewNamed('open')));

    act(() =>
      view.result.current.handleRecapturePreview({
        area: 'full-map',
        background: 'white',
      }),
    );
    act(() =>
      view.result.current.handleRecapturePreview({
        area: 'full-map',
        background: 'dark',
      }),
    );
    // The second choice lands first; the first one arrives late and must not
    // overwrite the composition the user is actually looking at.
    await act(async () => calls[2]!.resolve(previewNamed('dark')));
    await act(async () => calls[1]!.resolve(previewNamed('white')));

    expect(view.result.current.exportPreview?.dataUrl).toContain('dark');
  });

  it('discards a recapture that resolves after the dialog closed', async () => {
    const { view, calls, openDialog } = setupWorkflow();
    openDialog();
    await act(async () => calls[0]!.resolve(previewNamed('open')));

    act(() =>
      view.result.current.handleRecapturePreview({
        area: 'full-map',
        background: 'dark',
      }),
    );
    act(() => view.result.current.setIsExportDialogOpen(false));
    await act(async () => calls[1]!.resolve(previewNamed('late')));

    expect(view.result.current.exportPreview?.dataUrl).toContain('open');
  });

  it('keeps the visible preview when a capture cannot be produced', async () => {
    const { view, calls, openDialog } = setupWorkflow();
    openDialog();
    await act(async () => calls[0]!.resolve(previewNamed('open')));

    act(() =>
      view.result.current.handleRecapturePreview({
        area: 'full-map',
        background: 'dark',
      }),
    );
    await act(async () => calls[1]!.resolve(null));

    await waitFor(() =>
      expect(view.result.current.exportPreview?.dataUrl).toContain('open'),
    );
  });

  it('ignores a recapture asked for while the dialog is closed', () => {
    const { view, calls } = setupWorkflow();

    act(() =>
      view.result.current.handleRecapturePreview({
        area: 'full-map',
        background: 'dark',
      }),
    );

    expect(calls).toHaveLength(0);
  });
});
