import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHintCycle } from './useHintCycle';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useHintCycle — estado inicial', () => {
  it('devuelve "hidden" al montar', () => {
    const { result } = renderHook(() => useHintCycle());
    expect(result.current).toBe('hidden');
  });
});

describe('useHintCycle — primera sesión', () => {
  it('transiciona a "visible" tras 4000ms', () => {
    const { result } = renderHook(() => useHintCycle());
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current).toBe('visible');
  });

  it('persiste la clave en localStorage al mostrar el hint', () => {
    renderHook(() => useHintCycle());
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(localStorage.getItem('vellum:hint-shown')).toBe('true');
  });

  it('permanece "hidden" si el hint ya fue mostrado antes', () => {
    localStorage.setItem('vellum:hint-shown', 'true');
    const { result } = renderHook(() => useHintCycle());
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current).toBe('hidden');
  });
});

describe('useHintCycle — fade-out por drag', () => {
  it('transiciona a "leaving" al recibir dragenter estando "visible"', () => {
    const { result } = renderHook(() => useHintCycle());
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    act(() => {
      window.dispatchEvent(new Event('dragenter'));
    });

    expect(result.current).toBe('leaving');
  });

  it('vuelve a "hidden" tras 300ms del fade-out', () => {
    const { result } = renderHook(() => useHintCycle());
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    act(() => {
      window.dispatchEvent(new Event('dragenter'));
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('hidden');
  });

  it('dragenter antes del timer cancela el hint — permanece "hidden"', () => {
    const { result } = renderHook(() => useHintCycle());
    act(() => {
      vi.advanceTimersByTime(2000);
      window.dispatchEvent(new Event('dragenter'));
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe('hidden');
  });

  it('responde al evento personalizado "vellum:drag-enter"', () => {
    const { result } = renderHook(() => useHintCycle());
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    act(() => {
      window.dispatchEvent(new CustomEvent('vellum:drag-enter'));
    });

    expect(result.current).toBe('leaving');
  });
});

describe('useHintCycle — cleanup', () => {
  it('elimina los listeners de dragenter al desmontar', () => {
    const spy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useHintCycle());
    unmount();

    expect(spy).toHaveBeenCalledWith('dragenter', expect.any(Function));
    expect(spy).toHaveBeenCalledWith('vellum:drag-enter', expect.any(Function));
  });
});
