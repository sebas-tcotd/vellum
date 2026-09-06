import type { ServiceIconLegendState } from '@vellum/renderer-webgl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '../../test-utils';
import { IconLegend } from './IconLegend';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

/** Builds a `subscribeRef`-compatible object whose subscribe function captures the callback for tests to drive. */
function createSubscribeRef() {
  let captured: ((state: ServiceIconLegendState) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeRef = {
    current: (callback: (state: ServiceIconLegendState) => void) => {
      captured = callback;
      return unsubscribe;
    },
  };
  return {
    subscribeRef,
    unsubscribe,
    emit: (state: ServiceIconLegendState) => act(() => captured?.(state)),
  };
}

function renderLegend() {
  const { subscribeRef, emit, unsubscribe } = createSubscribeRef();
  const toggleRef: { current: (() => void) | null } = { current: null };
  const utils = render(
    <IconLegend subscribeRef={subscribeRef} toggleRef={toggleRef} />,
  );
  return { ...utils, emit, unsubscribe, toggleRef };
}

describe('IconLegend', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Estado hidden', () => {
    it('no renderiza nada antes de que zoom cruce el umbral', () => {
      const { container } = renderLegend();
      expect(container).toBeEmptyDOMElement();
    });

    it('no renderiza nada si el estado emitido tiene visible=false', () => {
      const { container, emit } = renderLegend();
      emit({ visible: false, groups: [] });
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('Estado announced → collapsed (auto-colapso a 2s)', () => {
    it('muestra el botón pill con texto al cruzar zoom≥14', () => {
      const { emit } = renderLegend();
      emit({ visible: true, groups: [] });
      expect(screen.getByText('iconLegend.buttonLabel')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'a11y.iconLegendToggle' }),
      ).toBeInTheDocument();
    });

    it('colapsa a solo-ícono tras 2s sin interacción', () => {
      const { emit } = renderLegend();
      emit({ visible: true, groups: [] });
      act(() => vi.advanceTimersByTime(2000));
      expect(
        screen.queryByText('iconLegend.buttonLabel'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'a11y.iconLegendToggle' }),
      ).toBeInTheDocument();
    });

    it('no colapsa antes de los 2s', () => {
      const { emit } = renderLegend();
      emit({ visible: true, groups: [] });
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByText('iconLegend.buttonLabel')).toBeInTheDocument();
    });

    it('reinicia el ciclo announced→collapsed en cada nuevo cruce de zoom hacia arriba', () => {
      const { emit } = renderLegend();
      emit({ visible: true, groups: [] });
      act(() => vi.advanceTimersByTime(2000));
      expect(
        screen.queryByText('iconLegend.buttonLabel'),
      ).not.toBeInTheDocument();

      emit({ visible: false, groups: [] });
      emit({ visible: true, groups: [] });
      expect(screen.getByText('iconLegend.buttonLabel')).toBeInTheDocument();
    });
  });

  describe('Expandir el panel', () => {
    it('click en el botón announced expande el panel', () => {
      const { emit } = renderLegend();
      emit({ visible: true, groups: ['water'] });
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.iconLegendToggle' }),
      );
      expect(
        screen.getByRole('region', { name: 'a11y.iconLegend' }),
      ).toBeInTheDocument();
      expect(screen.getByText('iconLegend.title')).toBeInTheDocument();
    });

    it('click en el botón collapsed también expande el panel', () => {
      const { emit } = renderLegend();
      emit({ visible: true, groups: [] });
      act(() => vi.advanceTimersByTime(2000));
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.iconLegendToggle' }),
      );
      expect(
        screen.getByRole('region', { name: 'a11y.iconLegend' }),
      ).toBeInTheDocument();
    });

    it('lista solo los ServiceGroup visibles emitidos', () => {
      const { emit } = renderLegend();
      emit({ visible: true, groups: ['water', 'education'] });
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.iconLegendToggle' }),
      );
      expect(screen.getByText('serviceGroups.water')).toBeInTheDocument();
      expect(screen.getByText('serviceGroups.education')).toBeInTheDocument();
      expect(
        screen.queryByText('serviceGroups.electricity'),
      ).not.toBeInTheDocument();
    });

    it('muestra el estado vacío cuando no hay grupos visibles', () => {
      const { emit } = renderLegend();
      emit({ visible: true, groups: [] });
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.iconLegendToggle' }),
      );
      expect(screen.getByText('iconLegend.empty')).toBeInTheDocument();
    });

    it('aria-expanded es true en estado expanded y false en announced/collapsed', () => {
      const { emit } = renderLegend();
      emit({ visible: true, groups: [] });
      const button = screen.getByRole('button', {
        name: 'a11y.iconLegendToggle',
      });
      expect(button).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('click de nuevo en el botón colapsa el panel expandido', () => {
      const { emit } = renderLegend();
      emit({ visible: true, groups: [] });
      const button = screen.getByRole('button', {
        name: 'a11y.iconLegendToggle',
      });
      fireEvent.click(button);
      fireEvent.click(button);
      expect(
        screen.queryByRole('region', { name: 'a11y.iconLegend' }),
      ).not.toBeInTheDocument();
    });

    it('Escape colapsa el panel y devuelve el foco al botón', () => {
      const { emit } = renderLegend();
      emit({ visible: true, groups: [] });
      const button = screen.getByRole('button', {
        name: 'a11y.iconLegendToggle',
      });
      fireEvent.click(button);
      // Dispatched on the focused control, the way a real keypress arrives —
      // the legend claims Escape in the capture phase on its way down.
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: 'Escape',
      });
      expect(
        screen.queryByRole('region', { name: 'a11y.iconLegend' }),
      ).not.toBeInTheDocument();
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'a11y.iconLegendToggle' }),
      );
    });
  });

  describe('Colapso forzado al bajar el zoom con el panel expandido', () => {
    it('colapsa primero (no se oculta de inmediato) cuando el panel está expanded y el zoom baja', () => {
      const { emit } = renderLegend();
      emit({ visible: true, groups: [] });
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.iconLegendToggle' }),
      );
      emit({ visible: false, groups: [] });
      expect(
        screen.queryByRole('region', { name: 'a11y.iconLegend' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'a11y.iconLegendToggle' }),
      ).toBeInTheDocument();
    });

    it('se oculta por completo en el siguiente ciclo de zoom bajo', () => {
      const { emit, container } = renderLegend();
      emit({ visible: true, groups: [] });
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.iconLegendToggle' }),
      );
      emit({ visible: false, groups: [] });
      emit({ visible: false, groups: [] });
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('Atajo de teclado (toggleRef)', () => {
    it('toggleRef.current no hace nada en estado hidden', () => {
      const { container, toggleRef } = renderLegend();
      act(() => toggleRef.current?.());
      expect(container).toBeEmptyDOMElement();
    });

    it('toggleRef.current expande el panel desde announced', () => {
      const { emit, toggleRef } = renderLegend();
      emit({ visible: true, groups: [] });
      act(() => toggleRef.current?.());
      expect(
        screen.getByRole('region', { name: 'a11y.iconLegend' }),
      ).toBeInTheDocument();
    });

    it('toggleRef.current colapsa el panel desde expanded', () => {
      const { emit, toggleRef } = renderLegend();
      emit({ visible: true, groups: [] });
      act(() => toggleRef.current?.());
      act(() => toggleRef.current?.());
      expect(
        screen.queryByRole('region', { name: 'a11y.iconLegend' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Limpieza de la suscripción', () => {
    it('llama la función de unsubscribe al desmontar', () => {
      const { unmount, unsubscribe } = renderLegend();
      unmount();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });
});
