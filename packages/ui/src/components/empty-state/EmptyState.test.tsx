// packages/ui/src/components/empty-state/EmptyState.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { EmptyState } from './EmptyState';

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
    expect(screen.getByRole('region')).toBeDefined();
  });

  it('renderiza el atajo Ctrl+O con su clave i18n', () => {
    render(<EmptyState />);
    expect(screen.getByText('emptyState.openShortcut')).toBeDefined();
  });

  it('el hint NO está en el DOM al montar (timer no ha expirado)', () => {
    render(<EmptyState />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('EmptyState — hint autodismissible (AC 3, 4, 5)', () => {
  it('el hint aparece en el DOM tras 4 segundos en la primera sesión (AC 3)', () => {
    render(<EmptyState />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => { vi.advanceTimersByTime(4000); });

    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByRole('status')).toHaveTextContent('emptyState.firstUseHint');
  });

  it('al mostrar el hint se persiste la clave en localStorage (AC 5)', () => {
    render(<EmptyState />);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(localStorage.getItem('vellum:hint-shown')).toBe('true');
  });

  it('el hint NO aparece si ya fue mostrado antes (AC 5)', () => {
    localStorage.setItem('vellum:hint-shown', 'true');
    render(<EmptyState />);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('el hint inicia fade-out (aria-hidden) inmediatamente al detectar dragenter (AC 4)', () => {
    render(<EmptyState />);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByRole('status')).toBeDefined();

    act(() => { window.dispatchEvent(new Event('dragenter')); });

    // El elemento está en el DOM pero aria-hidden=true (fase 'leaving')
    const status = screen.getByRole('status', { hidden: true });
    expect(status).toHaveAttribute('aria-hidden', 'true');
  });

  it('el hint se desmonta del DOM tras 300ms del fade-out (AC 4)', () => {
    render(<EmptyState />);
    act(() => { vi.advanceTimersByTime(4000); });

    act(() => { window.dispatchEvent(new Event('dragenter')); });
    act(() => { vi.advanceTimersByTime(300); });

    expect(screen.queryByRole('status', { hidden: true })).toBeNull();
  });

  it('dragenter antes del timer cancela el hint — nunca aparece (AC 4)', () => {
    render(<EmptyState />);

    act(() => {
      vi.advanceTimersByTime(2000);
      window.dispatchEvent(new Event('dragenter'));
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByRole('status', { hidden: true })).toBeNull();
  });

  it('el custom event vellum:drag-enter inicia fade-out (bridge Tauri, AC 4)', () => {
    render(<EmptyState />);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByRole('status')).toBeDefined();

    act(() => { window.dispatchEvent(new CustomEvent('vellum:drag-enter')); });

    const status = screen.getByRole('status', { hidden: true });
    expect(status).toHaveAttribute('aria-hidden', 'true');
  });

  it('vellum:drag-enter completa el desmontaje tras 300ms (bridge Tauri, AC 4)', () => {
    render(<EmptyState />);
    act(() => { vi.advanceTimersByTime(4000); });

    act(() => { window.dispatchEvent(new CustomEvent('vellum:drag-enter')); });
    act(() => { vi.advanceTimersByTime(300); });

    expect(screen.queryByRole('status', { hidden: true })).toBeNull();
  });

  it('vellum:drag-enter antes del timer cancela el hint (bridge Tauri)', () => {
    render(<EmptyState />);
    act(() => {
      vi.advanceTimersByTime(2000);
      window.dispatchEvent(new CustomEvent('vellum:drag-enter'));
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole('status', { hidden: true })).toBeNull();
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
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('el patrón SVG de fondo está oculto a screen readers (aria-hidden)', () => {
    const { container } = render(<EmptyState />);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('EmptyState — affordance visual de drop zone (AC 1)', () => {
  it('la zona de drop es un contenedor (no solo un párrafo)', () => {
    render(<EmptyState />);
    expect(screen.getByRole('region').tagName).not.toBe('P');
  });

  it('la zona de drop contiene drop hint y atajo Ctrl+O', () => {
    render(<EmptyState />);
    const region = screen.getByRole('region');
    expect(region).toHaveTextContent('emptyState.dropHint');
    expect(region).toHaveTextContent('emptyState.openShortcut');
  });
});
