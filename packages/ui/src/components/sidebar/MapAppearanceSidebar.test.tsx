import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReducer } from 'react';
import { fireEvent, render, screen } from '../../test-utils';
import type { LayerName } from '@vellum/core';
import { MapAppearanceSidebar } from './MapAppearanceSidebar';
import { useVellumStore } from '../../store/vellum-store';
import type { CommandRegistry } from '../../shell/commands';
import {
  initialShellSession,
  shellSessionReducer,
  type ShellSessionState,
} from '../../shell/shell-session';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts?.layer ? `${key}:${String(opts.layer)}` : key,
  }),
}));

/**
 * A registry whose commands delegate to the real session, so these tests
 * exercise the same route the native menu and shortcuts take.
 */
function makeCommands(
  dispatch: React.Dispatch<Parameters<typeof shellSessionReducer>[1]>,
): CommandRegistry {
  const stub = (id: string) =>
    ({ id, canExecute: true, execute: vi.fn() }) as never;
  const registry = {
    'document.open': stub('document.open'),
    'document.export': stub('document.export'),
    'view.fitCity': stub('view.fitCity'),
    'view.zoomIn': stub('view.zoomIn'),
    'view.zoomOut': stub('view.zoomOut'),
    'view.resetNorth': stub('view.resetNorth'),
    'view.rotate': stub('view.rotate'),
    'view.cleanView': stub('view.cleanView'),
    'view.mapSymbols': stub('view.mapSymbols'),
    'view.mapBounds': stub('view.mapBounds'),
    'layer.toggle': {
      id: 'layer.toggle',
      canExecute: true,
      execute: (layer: LayerName) =>
        useVellumStore.getState().toggleLayer(layer),
    },
    'layer.detail': {
      id: 'layer.detail',
      canExecute: true,
      execute: (layer: LayerName, invoker?: string) =>
        dispatch({
          type: 'sidebar/toggleDetail',
          layerId: layer,
          ...(invoker !== undefined ? { invoker } : {}),
        }),
    },
    'style.set': {
      id: 'style.set',
      canExecute: true,
      execute: (theme: string) =>
        useVellumStore.getState().setActiveTheme(theme),
    },
    'style.transitDimming': stub('style.transitDimming'),
  } as unknown as CommandRegistry;
  return registry;
}

function Harness({ initial }: { initial?: Partial<ShellSessionState> }) {
  const [state, dispatch] = useReducer(shellSessionReducer, {
    ...initialShellSession(1440),
    ...initial,
  });
  return (
    <MapAppearanceSidebar
      cityName="Altavento"
      fileName="altavento.cslmap"
      commands={makeCommands(dispatch)}
      shell={{ state, dispatch }}
    />
  );
}

const disclosure = (layer: string) =>
  screen.getByRole('button', { name: `a11y.configureLayer:layers.${layer}` });
const visibilitySwitch = (layer: string) =>
  screen.getByRole('switch', { name: `layers.${layer}` });

beforeEach(() => {
  useVellumStore.setState({
    activeLayers: {
      terrain: true,
      basemap: true,
      roads: true,
      transit: true,
      buildings: true,
      forests: true,
      districts: true,
    },
    availableThemes: [
      { id: 'day', name: 'Day' },
      { id: 'transit', name: 'Transit' },
    ] as never,
    activeTheme: 'day',
  });
});

describe('document context', () => {
  it('leads with the city and demotes the source file to a disclosure', () => {
    render(<Harness />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Altavento' }),
    ).toBeInTheDocument();

    const fileDisclosure = screen.getByText('documentContext.sourceFile');
    expect(screen.queryByText('altavento.cslmap')).not.toBeVisible();
    fireEvent.click(fileDisclosure);
    expect(screen.getByText('altavento.cslmap')).toBeVisible();
  });
});

describe('overview and detail', () => {
  it('replaces the body with exactly one layer detail', () => {
    render(<Harness />);
    fireEvent.click(disclosure('transit'));

    expect(screen.getByTestId('layer-detail-back')).toBeInTheDocument();
    // The overview's other rows are gone — the detail replaced the body
    // rather than stacking a second card beside it.
    expect(screen.queryByRole('switch', { name: 'layers.roads' })).toBeNull();

    expect(
      screen.getAllByRole('heading', { name: 'layers.transit' }),
    ).toHaveLength(1);
  });

  it('returns to overview via Back, preserving the choices made in the detail', () => {
    render(<Harness />);
    fireEvent.click(disclosure('buildings'));

    const colorByZone = screen.getByRole('switch', {
      name: 'layerOptionsPanel.colorByCategory',
    });
    fireEvent.click(colorByZone);
    expect(
      useVellumStore.getState().layerOptions.buildings.colorByCategory,
    ).toBe(true);

    fireEvent.click(screen.getByTestId('layer-detail-back'));
    expect(
      screen.getByRole('switch', { name: 'layers.roads' }),
    ).toBeInTheDocument();

    fireEvent.click(disclosure('buildings'));
    expect(
      screen.getByRole('switch', {
        name: 'layerOptionsPanel.colorByCategory',
      }),
    ).toBeChecked();
  });

  it('restores focus to the disclosure that opened the detail', () => {
    render(<Harness />);
    const trigger = disclosure('terrain');
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId('layer-detail-back'));

    expect(document.activeElement).toBe(disclosure('terrain'));
  });
});

describe('visibility and disclosure are independent (AD-11)', () => {
  it('toggling visibility does not open the detail', () => {
    render(<Harness />);
    fireEvent.click(visibilitySwitch('transit'));

    expect(useVellumStore.getState().activeLayers.transit).toBe(false);
    expect(screen.queryByTestId('layer-detail-back')).toBeNull();
  });

  it('opening the detail does not change visibility', () => {
    render(<Harness />);
    fireEvent.click(disclosure('transit'));

    expect(useVellumStore.getState().activeLayers.transit).toBe(true);
  });

  it('opens the detail of a hidden layer without turning it back on', () => {
    render(<Harness />);
    fireEvent.click(visibilitySwitch('transit'));
    fireEvent.click(disclosure('transit'));

    expect(screen.getByTestId('layer-detail-back')).toBeInTheDocument();
    expect(useVellumStore.getState().activeLayers.transit).toBe(false);

    // Editing the layer's own options must not implicitly reactivate it.
    fireEvent.click(screen.getAllByRole('switch')[0] as HTMLElement);
    expect(useVellumStore.getState().activeLayers.transit).toBe(false);
  });

  it('gives each control its own accessible name and focus stop', () => {
    render(<Harness />);
    expect(disclosure('transit')).not.toBe(visibilitySwitch('transit'));
    expect(disclosure('transit')).toHaveAttribute('aria-expanded', 'false');
  });

  it('offers a disclosure only for layers that have one', () => {
    render(<Harness />);
    expect(
      screen.queryByRole('button', {
        name: 'a11y.configureLayer:layers.roads',
      }),
    ).toBeNull();
    expect(visibilitySwitch('roads')).toBeInTheDocument();
  });
});

describe('compact rail', () => {
  it('keeps layer visibility reachable and drops style and detail', () => {
    render(
      <Harness
        initial={{
          sidebar: {
            width: 272,
            collapsed: true,
            view: { kind: 'overview' },
          },
        }}
      />,
    );

    fireEvent.click(visibilitySwitch('roads'));
    expect(useVellumStore.getState().activeLayers.roads).toBe(false);
    expect(screen.queryByText('sidebar.mapStyle')).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: 'a11y.configureLayer:layers.transit',
      }),
    ).toBeNull();
  });
});

describe('clean view', () => {
  it('is present and operable in the normal loaded state', () => {
    render(<Harness />);
    expect(screen.getByTestId('shell-sidebar')).not.toHaveAttribute('hidden');
  });

  it('hides the sidebar and marks it hidden from assistive technology', () => {
    render(<Harness initial={{ cleanView: true }} />);
    const sidebar = screen.getByTestId('shell-sidebar');
    expect(sidebar).toHaveAttribute('hidden');
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the layer detail context it had while hidden', () => {
    render(
      <Harness
        initial={{
          cleanView: true,
          sidebar: {
            width: 272,
            collapsed: false,
            view: { kind: 'detail', layerId: 'transit' },
          },
        }}
      />,
    );
    // Hidden, but the context survived — Clean view is a viewing mode, not a
    // reset of the shell session.
    expect(screen.getByTestId('layer-detail-back')).toBeInTheDocument();
  });
});

describe('export', () => {
  it('is not an appearance control any more', () => {
    render(<Harness />);
    expect(screen.queryByText('export.exportButton')).toBeNull();
  });
});

describe('width model', () => {
  it('offers a keyboard-operable resize handle within the documented bounds', () => {
    render(<Harness />);
    const handle = screen.getByTestId('sidebar-resize-handle');

    expect(handle).toHaveAttribute('role', 'separator');
    expect(handle).toHaveAttribute('tabindex', '0');
    expect(handle).toHaveAttribute('aria-valuemin', '240');
    expect(handle).toHaveAttribute('aria-valuemax', '320');
    expect(handle).toHaveAttribute('aria-valuenow', '272');

    fireEvent.keyDown(handle, { key: 'End' });
    expect(screen.getByTestId('sidebar-resize-handle')).toHaveAttribute(
      'aria-valuenow',
      '320',
    );

    fireEvent.keyDown(screen.getByTestId('sidebar-resize-handle'), {
      key: 'Home',
    });
    expect(screen.getByTestId('sidebar-resize-handle')).toHaveAttribute(
      'aria-valuenow',
      '240',
    );
  });

  it('clamps a resize past the bounds instead of accepting it', () => {
    render(<Harness />);
    const handle = screen.getByTestId('sidebar-resize-handle');

    for (let i = 0; i < 20; i += 1) {
      fireEvent.keyDown(screen.getByTestId('sidebar-resize-handle'), {
        key: 'ArrowRight',
      });
    }
    expect(screen.getByTestId('sidebar-resize-handle')).toHaveAttribute(
      'aria-valuenow',
      '320',
    );
    expect(handle).toBeInTheDocument();
  });

  it('hides the handle on the compact rail, which has no width to adjust', () => {
    render(
      <Harness
        initial={{
          sidebar: { width: 272, collapsed: true, view: { kind: 'overview' } },
        }}
      />,
    );
    expect(screen.queryByTestId('sidebar-resize-handle')).toBeNull();
  });
});
