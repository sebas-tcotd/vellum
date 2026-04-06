// packages/ui/src/components/empty-state/EmptyState.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { EmptyState } from './EmptyState';

// Mock react-i18next — devuelve la clave tal cual para facilitar assertions
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('EmptyState — renderizado base', () => {
  it('renderiza el wordmark con la clave i18n emptyState.title', () => {
    render(<EmptyState />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('emptyState.title');
  });

  it('renderiza la zona de drop con role="region"', () => {
    render(<EmptyState />);
    const region = screen.getByRole('region');
    expect(region).toBeDefined();
  });

  it('renderiza el atajo Ctrl+O con su clave i18n', () => {
    render(<EmptyState />);
    expect(screen.getByText('emptyState.openShortcut')).toBeDefined();
  });

  it('el hint NO es visible al montar (timer no ha expirado)', () => {
    render(<EmptyState />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('EmptyState — hint autodismissible (AC 3, 4, 5)', () => {
  it('el hint aparece tras 4 segundos en la primera sesión (AC 3)', () => {
    render(<EmptyState />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByRole('status')).toHaveTextContent('emptyState.firstUseHint');
  });

  it('al mostrar el hint se persiste la clave en localStorage (AC 5)', () => {
    render(<EmptyState />);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(localStorage.getItem('vellum:hint-shown')).toBe('true');
  });

  it('el hint NO aparece si ya fue mostrado antes (AC 5)', () => {
    localStorage.setItem('vellum:hint-shown', 'true');
    render(<EmptyState />);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('el hint se oculta inmediatamente al detectar dragenter en window (AC 4)', () => {
    render(<EmptyState />);

    // Primero mostramos el hint
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole('status')).toBeDefined();

    // Simulamos dragenter en window
    act(() => {
      window.dispatchEvent(new Event('dragenter'));
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('dragenter antes del timer cancela el hint (AC 4)', () => {
    render(<EmptyState />);

    act(() => {
      vi.advanceTimersByTime(2000);
      window.dispatchEvent(new Event('dragenter'));
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('el custom event vellum:drag-enter también oculta el hint (bridge Tauri)', () => {
    render(<EmptyState />);

    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByRole('status')).toBeDefined();

    act(() => {
      window.dispatchEvent(new CustomEvent('vellum:drag-enter'));
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('vellum:drag-enter antes del timer cancela el hint (bridge Tauri)', () => {
    render(<EmptyState />);

    act(() => {
      vi.advanceTimersByTime(2000);
      window.dispatchEvent(new CustomEvent('vellum:drag-enter'));
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('EmptyState — cleanup (AC 4)', () => {
  it('los listeners de dragenter y vellum:drag-enter se limpian al desmontar', () => {
    const { unmount } = render(<EmptyState />);
    const spy = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(spy).toHaveBeenCalledWith('dragenter', expect.any(Function));
    expect(spy).toHaveBeenCalledWith('vellum:drag-enter', expect.any(Function));
  });
});

describe('EmptyState — accesibilidad (AC 1, Task 7)', () => {
  it('la zona de drop tiene role="region" con aria-label descriptivo', () => {
    render(<EmptyState />);
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('aria-label');
    expect(region.getAttribute('aria-label')).toBeTruthy();
  });

  it('el hint visible tiene role="status" para screen readers', () => {
    render(<EmptyState />);
    act(() => { vi.advanceTimersByTime(4000); });
    const status = screen.getByRole('status');
    expect(status).toBeDefined();
  });

  it('el patrón SVG de fondo está oculto a screen readers (aria-hidden)', () => {
    const { container } = render(<EmptyState />);
    const hiddenDivs = container.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenDivs.length).toBeGreaterThan(0);
  });
});

describe('EmptyState — affordance visual de drop zone (AC 1 — code review finding)', () => {
  it('la zona de drop es un contenedor con role="region" (no solo texto)', () => {
    render(<EmptyState />);
    // Debe ser un div/section/aside con role="region", no un párrafo
    const region = screen.getByRole('region');
    expect(region.tagName).not.toBe('P');
  });

  it('la zona de drop contiene el texto de drop hint y el atajo Ctrl+O', () => {
    render(<EmptyState />);
    const region = screen.getByRole('region');
    expect(region).toHaveTextContent('emptyState.dropHint');
    expect(region).toHaveTextContent('emptyState.openShortcut');
  });
});
