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

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

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
    expect(useVellumStore.getState().cityData).toEqual(fakeCityData);
  });

  it('transitions to error when invoke rejects', async () => {
    const fakeError = { type: 'InvalidFile', reason: 'bad file' };
    vi.mocked(invoke).mockRejectedValue(fakeError);

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.loadFile('/path/to/bad.cslmap'));

    expect(useVellumStore.getState().loadingState).toBe('error');
    expect(useVellumStore.getState().loadingError).toEqual(fakeError);
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
    expect(useVellumStore.getState().cityData).toEqual(fakeCityData);
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

    expect(exportCancelHandlerRef.current).toHaveBeenCalledOnce();
    expect(useVellumStore.getState().cityData).toEqual(fakeCityData);
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
