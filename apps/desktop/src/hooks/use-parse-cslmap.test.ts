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

  it('transiciona atómicamente a loading durante la carga (estado intermedio)', async () => {
    let resolveInvoke!: (v: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(
      () => new Promise((r) => (resolveInvoke = r)),
    );

    const { result } = renderHook(() => useParseCslmap());

    act(() => {
      void result.current.loadFile('/path/to/city.cslmap');
    });

    // incrementLoadRequestId atómicamente setea loadingState: 'loading'
    expect(useVellumStore.getState().loadingState).toBe('loading');
    expect(useVellumStore.getState().cityData).toBeNull();

    await act(async () => {
      resolveInvoke(makeCityData());
    });

    expect(useVellumStore.getState().loadingState).toBe('idle');
  });

  it('transiciona a loading y luego idle en happy path', async () => {
    const fakeCityData = makeCityData();
    vi.mocked(invoke).mockResolvedValue(fakeCityData);

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.loadFile('/path/to/city.cslmap'));

    expect(useVellumStore.getState().loadingState).toBe('idle');
    expect(useVellumStore.getState().cityData).toEqual(fakeCityData);
  });

  it('transiciona a error cuando invoke lanza', async () => {
    const fakeError = { type: 'InvalidFile', reason: 'bad file' };
    vi.mocked(invoke).mockRejectedValue(fakeError);

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.loadFile('/path/to/bad.cslmap'));

    expect(useVellumStore.getState().loadingState).toBe('error');
    expect(useVellumStore.getState().loadingError).toEqual(fakeError);
  });

  it('ignora respuesta stale cuando hay race condition', async () => {
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

  it('no llama loadFile si el usuario cancela el dialog', async () => {
    vi.mocked(open).mockResolvedValue(null);

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.openFileDialog());

    expect(invoke).not.toHaveBeenCalled();
    expect(useVellumStore.getState().loadingState).toBe('idle');
  });

  it('maneja excepción del dialog sin cambiar el estado', async () => {
    vi.mocked(open).mockRejectedValue(new Error('Dialog failed'));

    const { result } = renderHook(() => useParseCslmap());
    await act(() => result.current.openFileDialog());

    expect(invoke).not.toHaveBeenCalled();
    expect(useVellumStore.getState().loadingState).toBe('idle');
  });
});
