import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useParseCslmap } from './use-parse-cslmap';
import { useVellumStore } from '@vellum/ui';
import { makeCityData } from '@vellum/core/testing';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));
vi.mock('@tauri-apps/api/path', () => ({ resolveResource: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { resolveResource } from '@tauri-apps/api/path';
import { SAMPLE_CITY } from '../sample-city';

describe('useParseCslmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVellumStore.setState({
      loadingState: 'idle',
      cityData: null,
      loadingError: null,
      loadRequestId: 0,
    });
  });

  it('resolves the bundled resource and loads it through the ordinary parser', async () => {
    vi.mocked(resolveResource).mockResolvedValue(
      '/installed/resources/sample-city/city.vellummap',
    );
    const city = makeCityData({ cityName: 'Aurelia del Delta' });
    vi.mocked(invoke).mockResolvedValue(city);
    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.openSampleCity());
    expect(resolveResource).toHaveBeenCalledWith(SAMPLE_CITY.resourcePath);
    expect(invoke).toHaveBeenCalledWith('parse_cslmap', {
      filePath: '/installed/resources/sample-city/city.vellummap',
      allowPartial: false,
    });
    expect(useVellumStore.getState().cityData).toEqual({
      ...city,
      fileName: 'city.vellummap',
    });
  });

  it('maps a missing bundled resource to a typed error and keeps the current city', async () => {
    const city = makeCityData();
    useVellumStore.setState({ cityData: city });
    vi.mocked(resolveResource).mockRejectedValue(new Error('resource missing'));
    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.openSampleCity());
    expect(invoke).not.toHaveBeenCalled();
    expect(useVellumStore.getState().cityData).toBe(city);
    expect(useVellumStore.getState().loadingError).toEqual({
      type: 'IoError',
      reason: 'resource missing',
    });
  });

  it('preserves typed parser errors when the bundled document is corrupt', async () => {
    vi.mocked(resolveResource).mockResolvedValue('/sample.vellummap');
    vi.mocked(invoke).mockRejectedValue({
      type: 'InvalidFile',
      reason: 'bad archive',
    });
    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.openSampleCity());
    expect(useVellumStore.getState().loadingError?.type).toBe('InvalidFile');
  });

  it.each(['resolve', 'reject'])(
    'ignores a stale resource %s after a newer file load',
    async (outcome) => {
      let resolve!: (path: string) => void;
      let reject!: (error: Error) => void;
      vi.mocked(resolveResource).mockImplementation(
        () =>
          new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          }),
      );
      vi.mocked(invoke).mockResolvedValue(
        makeCityData({ cityName: 'Newest city' }),
      );
      const { result } = renderHook(() => useParseCslmap());
      let sample!: Promise<void>;
      await act(async () => {
        sample = result.current.openSampleCity();
      });
      expect(useVellumStore.getState().loadingState).toBe('loading');
      await act(() => result.current.loadFile('/newest.vellummap'));
      await act(async () => {
        if (outcome === 'resolve') resolve('/sample.vellummap');
        else reject(new Error('stale resource error'));
        await sample;
      });
      expect(invoke).toHaveBeenCalledOnce();
      expect(useVellumStore.getState().cityData?.cityName).toBe('Newest city');
      expect(useVellumStore.getState().loadingError).toBeNull();
    },
  );

  it('waits for export cancellation before resolving the sample or mutating the store', async () => {
    const city = makeCityData();
    useVellumStore.setState({ cityData: city });
    let cancel!: () => void;
    const cancellation = {
      current: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            cancel = resolve;
          }),
      ),
    };
    vi.mocked(resolveResource).mockResolvedValue('/sample.vellummap');
    vi.mocked(invoke).mockResolvedValue(makeCityData());
    const { result } = renderHook(() => useParseCslmap(cancellation));
    let sample!: Promise<void>;
    await act(async () => {
      sample = result.current.openSampleCity();
    });
    expect(resolveResource).not.toHaveBeenCalled();
    expect(useVellumStore.getState().cityData).toBe(city);
    expect(useVellumStore.getState().loadRequestId).toBe(0);
    await act(async () => {
      cancel();
      await sample;
    });
    expect(resolveResource).toHaveBeenCalledOnce();
  });

  it('keeps the current city when sample export cancellation times out', async () => {
    vi.useFakeTimers();
    try {
      const city = makeCityData();
      useVellumStore.setState({ cityData: city });
      const { result } = renderHook(() =>
        useParseCslmap({ current: () => new Promise<void>(() => undefined) }),
      );
      await act(async () => {
        const sample = result.current.openSampleCity();
        await vi.advanceTimersByTimeAsync(3000);
        await sample;
      });
      expect(resolveResource).not.toHaveBeenCalled();
      expect(useVellumStore.getState().cityData).toBe(city);
      expect(useVellumStore.getState().loadingError?.type).toBe('IoError');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['resolves', 'times out'])(
    'ignores older export cancellation that %s after a newer load succeeds',
    async (outcome) => {
      vi.useFakeTimers();
      try {
        let finishCancellation!: () => void;
        const cancellation = {
          current: vi.fn(
            () =>
              new Promise<void>((resolve) => {
                finishCancellation = resolve;
              }),
          ),
        };
        const { result } = renderHook(() => useParseCslmap(cancellation));
        let olderLoad!: Promise<void>;
        await act(async () => {
          olderLoad = result.current.openSampleCity();
        });
        cancellation.current = vi.fn(async () => undefined);
        vi.mocked(invoke).mockResolvedValue(
          makeCityData({ cityName: 'Newest city' }),
        );
        await act(() => result.current.loadFile('/newest.vellummap'));
        const newestCity = useVellumStore.getState().cityData;
        const newestRequestId = useVellumStore.getState().loadRequestId;
        await act(async () => {
          if (outcome === 'resolves') finishCancellation();
          else await vi.advanceTimersByTimeAsync(3000);
          await olderLoad;
        });
        expect(resolveResource).not.toHaveBeenCalled();
        expect(invoke).toHaveBeenCalledOnce();
        expect(useVellumStore.getState().cityData).toBe(newestCity);
        expect(useVellumStore.getState().cityData?.cityName).toBe(
          'Newest city',
        );
        expect(useVellumStore.getState().loadRequestId).toBe(newestRequestId);
        expect(useVellumStore.getState().loadingState).toBe('idle');
        expect(useVellumStore.getState().loadingError).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('atomically transitions to loading during file load (intermediate state)', async () => {
    let resolveInvoke!: (v: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(
      () => new Promise((r) => (resolveInvoke = r)),
    );

    const { result } = renderHook(() => useParseCslmap());

    await act(async () => {
      void result.current.loadFile('/path/to/city.cslmap');
      // Flushes the bounded cancel-before-load microtask (a no-op here,
      // since no export is active) before `incrementLoadRequestId()` runs.
      await new Promise((r) => setTimeout(r, 0));
    });

    // incrementLoadRequestId atomically sets loadingState to 'loading'
    expect(useVellumStore.getState().loadingState).toBe('loading');
    expect(useVellumStore.getState().cityData).toBeNull();

    await act(async () => {
      resolveInvoke(makeCityData());
    });

    expect(useVellumStore.getState().loadingState).toBe('idle');
  });

  it('transitions to loading and then idle in happy path', async () => {
    const fakeCityData = makeCityData();
    vi.mocked(invoke).mockResolvedValue(fakeCityData);

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.loadFile('/path/to/city.cslmap'));

    expect(useVellumStore.getState().loadingState).toBe('idle');
    expect(useVellumStore.getState().cityData).toEqual({
      ...fakeCityData,
      fileName: 'city.cslmap',
    });
  });

  it('transitions to error when invoke rejects', async () => {
    const fakeError = { type: 'InvalidFile', reason: 'bad file' };
    vi.mocked(invoke).mockRejectedValue(fakeError);

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.loadFile('/path/to/bad.cslmap'));

    expect(useVellumStore.getState().loadingState).toBe('error');
    expect(useVellumStore.getState().loadingError).toEqual(fakeError);
  });

  it('keeps the last valid city when a native document is rejected', async () => {
    const valid = makeCityData({ cityName: 'Costa Tijuca' });
    useVellumStore.getState().setCityData(valid);
    const rejection = {
      type: 'InvalidFile',
      reason: '`roads.json` does not match its sha256',
    };
    vi.mocked(invoke).mockRejectedValue(rejection);

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.loadFile('/cities/broken.vellummap'));

    expect(invoke).toHaveBeenCalledWith('parse_cslmap', {
      filePath: '/cities/broken.vellummap',
      allowPartial: false,
    });
    expect(useVellumStore.getState().loadingState).toBe('error');
    expect(useVellumStore.getState().loadingError).toEqual(rejection);
    expect(useVellumStore.getState().cityData).toBe(valid);
  });

  // The parser reports an absent `version` attribute as the empty string, and
  // `toVellumError` admits it only because its guard is `typeof found === 'string'`.
  // A truthiness guard there would collapse this into the generic IoError
  // fallback and silently undo the MissingVersion message.
  it('preserva UnsupportedVersion con found vacío en vez de caer al fallback', async () => {
    const missingVersion = { type: 'UnsupportedVersion', found: '' };
    vi.mocked(invoke).mockRejectedValue(missingVersion);

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.loadFile('/path/to/no-version.cslmap'));

    expect(useVellumStore.getState().loadingState).toBe('error');
    expect(useVellumStore.getState().loadingError).toEqual(missingVersion);
  });

  // The "Try partial render" retry must surface the gate error too — the Rust
  // gate ignores lenient mode, and nothing else pins that the UI shows it.
  it('propaga el error del gate también en el reintento parcial', async () => {
    const unsupported = { type: 'UnsupportedVersion', found: '3.0' };
    vi.mocked(invoke).mockRejectedValue(unsupported);

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.loadFile('/path/to/old.cslmap'));
    await act(() => result.current.loadFilePartial());

    expect(useVellumStore.getState().loadingState).toBe('error');
    expect(useVellumStore.getState().loadingError).toEqual(unsupported);
  });

  it('ignores stale response during race conditions', async () => {
    let resolveFirst!: (v: unknown) => void;
    vi.mocked(invoke)
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce(makeCityData({ cityName: 'Ciudad B' }));

    const { result } = renderHook(() => useParseCslmap());

    await act(async () => {
      void result.current.loadFile('/a.cslmap');
    });
    await act(() => result.current.loadFile('/b.cslmap'));
    await act(async () => {
      resolveFirst(makeCityData({ cityName: 'Ciudad A' }));
    });

    expect(useVellumStore.getState().cityData?.cityName).toBe('Ciudad B');
  });

  it('offers both city documents in the open dialog', async () => {
    vi.mocked(open).mockResolvedValue(null);

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.openFileDialog());

    const [options] = vi.mocked(open).mock.lastCall!;
    expect(options?.filters?.[0]?.extensions).toEqual(['vellummap', 'cslmap']);
  });

  it('does not call loadFile if user cancels dialog', async () => {
    vi.mocked(open).mockResolvedValue(null);

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.openFileDialog());

    expect(invoke).not.toHaveBeenCalled();
    expect(useVellumStore.getState().loadingState).toBe('idle');
  });

  it('handles dialog exceptions by setting error state', async () => {
    vi.mocked(open).mockRejectedValue(new Error('Dialog failed'));

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.openFileDialog());

    expect(invoke).not.toHaveBeenCalled();
    expect(useVellumStore.getState().loadingState).toBe('error');
    expect(useVellumStore.getState().loadingError).toEqual({
      type: 'IoError',
      reason: 'Dialog failed',
    });
  });

  it('awaits exportCancelHandlerRef before incrementLoadRequestId resets cityData/loadingState (AD-15)', async () => {
    const oldCityData = makeCityData({ cityName: 'Old City' });
    useVellumStore.setState({ cityData: oldCityData, loadingState: 'idle' });
    const fakeCityData = makeCityData({ cityName: 'New City' });
    vi.mocked(invoke).mockResolvedValue(fakeCityData);
    const exportCancelHandlerRef = {
      current: vi.fn(async () => {
        // Must run before `incrementLoadRequestId()` resets cityData to
        // null and loadingState to 'loading' — proves cancellation happens
        // before the store mutates, not reactively after.
        expect(useVellumStore.getState().cityData).toBe(oldCityData);
        expect(useVellumStore.getState().loadingState).toBe('idle');
      }),
    };

    const { result } = renderHook(() => useParseCslmap(exportCancelHandlerRef));
    await act(() => result.current.loadFile('/path/to/city.cslmap'));

    expect(exportCancelHandlerRef.current).toHaveBeenCalledOnce();
    expect(useVellumStore.getState().cityData).toEqual({
      ...fakeCityData,
      fileName: 'city.cslmap',
    });
  });

  it('awaits exportCancelHandlerRef before incrementLoadRequestId in the partial-parse retry path', async () => {
    const oldCityData = makeCityData({ cityName: 'Old City' });
    const fakeCityData = makeCityData({ cityName: 'New City' });
    useVellumStore.setState({ cityData: oldCityData, loadingState: 'idle' });
    vi.mocked(invoke).mockResolvedValue(fakeCityData);
    const exportCancelHandlerRef = {
      current: vi.fn(async () => {
        expect(useVellumStore.getState().cityData).toBe(oldCityData);
        expect(useVellumStore.getState().loadingState).toBe('idle');
      }),
    };

    const { result } = renderHook(() => useParseCslmap(exportCancelHandlerRef));
    // loadFilePartial re-uses the last attempted path, set by a prior loadFile.
    await act(() => result.current.loadFile('/path/to/city.cslmap'));
    exportCancelHandlerRef.current.mockClear();
    useVellumStore.setState({ cityData: oldCityData, loadingState: 'idle' });

    await act(() => result.current.loadFilePartial());

    expect(useVellumStore.getState().hasPartialData).toBe(true);
    expect(exportCancelHandlerRef.current).toHaveBeenCalledOnce();
    expect(useVellumStore.getState().cityData).toEqual({
      ...fakeCityData,
      fileName: 'city.cslmap',
    });
  });

  it('times out waiting for export cancellation, keeps the current city untouched, and surfaces a localized error', async () => {
    vi.useFakeTimers();
    try {
      const oldCityData = makeCityData({ cityName: 'Old City' });
      useVellumStore.setState({ cityData: oldCityData, loadingState: 'idle' });
      const exportCancelHandlerRef = {
        // Never resolves — simulates a stuck/hanging export cancellation.
        current: vi.fn(() => new Promise<void>(() => undefined)),
      };

      const { result } = renderHook(() =>
        useParseCslmap(exportCancelHandlerRef),
      );

      await act(async () => {
        const loadPromise = result.current.loadFile('/path/to/city.cslmap');
        await vi.advanceTimersByTimeAsync(3_000);
        await loadPromise;
      });

      expect(invoke).not.toHaveBeenCalled();
      expect(useVellumStore.getState().cityData).toBe(oldCityData);
      expect(useVellumStore.getState().loadingState).toBe('error');
      expect(useVellumStore.getState().loadingError).toEqual({
        type: 'IoError',
        reason:
          'Timed out waiting for the active export to cancel before loading a new city',
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
