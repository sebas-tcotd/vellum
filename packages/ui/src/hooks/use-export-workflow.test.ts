import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CityData,
  ExportPreviewOptions,
  ExportPreviewSnapshot,
  SvgExportPort,
  SvgExportRequest,
  SvgExportSnapshot,
} from '@vellum/core';
import { useVellumStore } from '../store/vellum-store';
import {
  makeExportPreviewSnapshot,
  makeMarginaliaLabels,
  makePresentationOptions,
} from '@vellum/core/testing';
import { useExportWorkflow } from './use-export-workflow';

/** Minimal city stand-in: the hook only ever compares it by reference. */
const CITY = { cityName: 'Altavento' } as unknown as CityData;

function previewNamed(label: string): ExportPreviewSnapshot {
  return makeExportPreviewSnapshot({
    dataUrl: `data:image/png;base64,${label}`,
  });
}

describe('useExportWorkflow export request', () => {
  beforeEach(() => {
    useVellumStore.setState({ cityData: CITY, loadingState: 'idle' });
  });

  it('adjunta presentación y textos resueltos, sin aviso de presentación SVG', async () => {
    const captured: SvgExportRequest[] = [];
    const svgExporter: SvgExportPort = {
      mode: 'streaming-svg',
      capabilitiesForSnapshot: vi.fn().mockReturnValue({ eligible: true }),
      export: vi
        .fn()
        .mockResolvedValue({ filePath: '/x.svg', folderPath: '/' }),
    };
    const svgSnapshotCaptureRef = {
      current: (request: SvgExportRequest) => {
        captured.push(request);
        return { snapshotId: 'svg-1', request } as unknown as SvgExportSnapshot;
      },
    };
    const view = renderHook(() =>
      useExportWorkflow({
        cityData: CITY,
        loadingState: 'idle',
        svgExporter,
        previewCaptureRef: { current: null },
        snapshotCaptureRef: { current: null },
        svgSnapshotCaptureRef,
        isExportingProp: false,
      }),
    );
    const presentation = makePresentationOptions({
      showCityName: true,
      showScaleBar: true,
      author: 'Ana',
      corner: 'top-right',
    });
    const labels = makeMarginaliaLabels();

    await act(async () =>
      view.result.current.handleExport({
        format: 'svg',
        area: 'viewport',
        background: 'white',
        fileName: 'mapa',
        presentation,
        labels,
      }),
    );

    expect(captured).toEqual([
      {
        format: 'svg',
        area: 'viewport',
        background: 'white',
        fileName: 'mapa',
        presentation,
        labels,
      },
    ]);
    expect(view.result.current.exportWarnings).toEqual([]);
    expect(view.result.current.exportResult).toEqual({
      filePath: '/x.svg',
      folderPath: '/',
    });
  });
});

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
