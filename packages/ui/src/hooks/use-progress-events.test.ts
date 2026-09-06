import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '../test-utils';
import { useProgressEvents } from './use-progress-events';

import { createPlatformServicesHarness } from '../testing/test-platform-services';

let harness = createPlatformServicesHarness();
let mockUnlisten = harness.unsubscribe;
let mockListen = harness.subscribeEvent;

vi.mock('@vellum/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vellum/core')>();
  return {
    ...actual,
    IPC_EVENTS: { PROGRESS: 'vellum://progress' },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  harness = createPlatformServicesHarness();
  mockUnlisten = harness.unsubscribe;
  mockListen = harness.subscribeEvent;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useProgressEvents', () => {
  it('retorna percent inicial en 0 y listenError en false', () => {
    const { result } = renderHook(() => useProgressEvents(), {
      wrapper: harness.wrapper,
    });
    expect(result.current.percent).toBe(0);
    expect(result.current.listenError).toBe(false);
  });

  it('registra el listener de vellum://progress al montar', async () => {
    renderHook(() => useProgressEvents(), { wrapper: harness.wrapper });
    await act(async () => {});
    expect(mockListen).toHaveBeenCalledWith(
      'vellum://progress',
      expect.any(Function),
    );
  });

  it('actualiza percent cuando recibe un evento de progreso', async () => {
    const { result } = renderHook(() => useProgressEvents(), {
      wrapper: harness.wrapper,
    });
    await act(async () => {});

    const handler = mockListen.mock.calls[0][1] as (payload: {
      percent: number;
      currentStep: string;
    }) => void;

    act(() => {
      handler({ percent: 60, currentStep: 'roads' });
    });

    expect(result.current.percent).toBe(60);
  });

  it('clampea percent a 0 cuando el valor es negativo', async () => {
    const { result } = renderHook(() => useProgressEvents(), {
      wrapper: harness.wrapper,
    });
    await act(async () => {});

    const handler = mockListen.mock.calls[0][1] as (payload: {
      percent: number;
      currentStep: string;
    }) => void;

    act(() => {
      handler({ percent: -10, currentStep: 'init' });
    });

    expect(result.current.percent).toBe(0);
  });

  it('clampea percent a 100 cuando el valor supera el máximo', async () => {
    const { result } = renderHook(() => useProgressEvents(), {
      wrapper: harness.wrapper,
    });
    await act(async () => {});

    const handler = mockListen.mock.calls[0][1] as (payload: {
      percent: number;
      currentStep: string;
    }) => void;

    act(() => {
      handler({ percent: 150, currentStep: 'done' });
    });

    expect(result.current.percent).toBe(100);
  });

  it('clampea percent a 0 cuando el valor es NaN', async () => {
    const { result } = renderHook(() => useProgressEvents(), {
      wrapper: harness.wrapper,
    });
    await act(async () => {});

    const handler = mockListen.mock.calls[0][1] as (payload: {
      percent: number;
      currentStep: string;
    }) => void;

    act(() => {
      handler({ percent: NaN, currentStep: 'init' });
    });

    expect(result.current.percent).toBe(0);
  });

  it('activa listenError cuando listen() rechaza', async () => {
    mockListen.mockRejectedValue(new Error('IPC unavailable'));
    const { result } = renderHook(() => useProgressEvents(), {
      wrapper: harness.wrapper,
    });
    await act(async () => {});
    expect(result.current.listenError).toBe(true);
  });

  it('activa listenError por timeout si listen() nunca resuelve', async () => {
    mockListen.mockReturnValue(new Promise(() => {})); // nunca resuelve
    const { result } = renderHook(() => useProgressEvents(), {
      wrapper: harness.wrapper,
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.listenError).toBe(true);
  });

  it('llama unlisten al desmontar el hook', async () => {
    const { unmount } = renderHook(() => useProgressEvents(), {
      wrapper: harness.wrapper,
    });
    await act(async () => {});
    unmount();
    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });

  it('no actualiza percent si el componente fue desmontado antes de resolver listen', async () => {
    let resolveListenFn!: (fn: () => void) => void;
    mockListen.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveListenFn = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useProgressEvents(), {
      wrapper: harness.wrapper,
    });
    unmount();

    await act(async () => {
      resolveListenFn(mockUnlisten);
    });

    expect(result.current.percent).toBe(0);
    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });
});
