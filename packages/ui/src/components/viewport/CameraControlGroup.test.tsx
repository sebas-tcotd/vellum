import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '../../test-utils';
import { CameraControlGroup } from './CameraControlGroup';
import type { CommandRegistry } from '../../shell/commands';
import type { MapZoomState } from '@vellum/core';

const noZoomState = () => null;
const noZoomSubscription = () => () => {};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function makeCommands(
  overrides: Partial<Record<string, { canExecute: boolean }>> = {},
): { commands: CommandRegistry; executed: string[] } {
  const executed: string[] = [];
  const ids = [
    'document.open',
    'document.export',
    'view.fitCity',
    'view.zoomIn',
    'view.zoomOut',
    'view.preciseZoom',
    'view.resetNorth',
    'view.rotate',
    'view.cleanView',
    'view.mapSymbols',
    'view.mapBounds',
    'layer.toggle',
    'layer.detail',
    'style.set',
    'style.transitDimming',
  ];
  const registry = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        id,
        canExecute: overrides[id]?.canExecute ?? true,
        execute: () => executed.push(id),
      },
    ]),
  ) as unknown as CommandRegistry;
  return { commands: registry, executed };
}

describe('camera controls', () => {
  /** Opens the precise zoom popover the way a user does: Option/Alt+click on +. */
  const openPrecise = () =>
    fireEvent.click(screen.getByRole('button', { name: 'camera.zoomIn' }), {
      altKey: true,
    });

  it('keeps precise zoom hidden until Option/Alt+click on + or −', () => {
    const { commands, executed } = makeCommands();
    const onZoomChange = vi.fn();
    render(
      <CameraControlGroup
        commands={commands}
        bearing={0}
        getZoomState={() => ({ zoom: 9.24, min: 4, max: 18 })}
        subscribeZoom={noZoomSubscription}
        onZoomChange={onZoomChange}
      />,
    );
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();

    openPrecise();
    expect(executed).toEqual([]);
    const slider = screen.getByRole('slider', { name: 'camera.zoomSlider' });
    expect(slider).toHaveValue('9.24');
    expect(slider).toHaveAttribute('min', '4');
    expect(slider).toHaveAttribute('max', '18');
    fireEvent.change(slider, { target: { value: '10.5' } });
    expect(onZoomChange).toHaveBeenCalledWith(10.5);

    // A plain click still zooms, with the popover open.
    fireEvent.click(screen.getByRole('button', { name: 'camera.zoomOut' }));
    expect(executed).toEqual(['view.zoomOut']);
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('shows one decimal and applies a typed zoom, restoring invalid input', () => {
    const { commands } = makeCommands();
    const onZoomChange = vi.fn();
    render(
      <CameraControlGroup
        commands={commands}
        bearing={0}
        getZoomState={() => ({ zoom: 9.24, min: 4, max: 18 })}
        subscribeZoom={noZoomSubscription}
        onZoomChange={onZoomChange}
      />,
    );
    openPrecise();

    const input = screen.getByRole('textbox', { name: 'camera.zoomInput' });
    expect(input).toHaveValue('9.2');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '12,35' } });
    fireEvent.blur(input);
    expect(onZoomChange).toHaveBeenCalledWith(12.35);

    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(onZoomChange).toHaveBeenCalledOnce();
    expect(input).toHaveValue('9.2');
  });

  it('applies a typed zoom once when Enter is pressed', () => {
    const { commands } = makeCommands();
    const onZoomChange = vi.fn();
    render(
      <CameraControlGroup
        commands={commands}
        bearing={0}
        getZoomState={() => ({ zoom: 9.25, min: 4, max: 18 })}
        subscribeZoom={noZoomSubscription}
        onZoomChange={onZoomChange}
      />,
    );
    openPrecise();

    const input = screen.getByRole('textbox', { name: 'camera.zoomInput' });
    fireEvent.change(input, { target: { value: '12.35' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onZoomChange).toHaveBeenCalledOnce();
    expect(onZoomChange).toHaveBeenCalledWith(12.35);
  });

  it('does not open before the map publishes its zoom, or while unavailable', () => {
    const { commands } = makeCommands({
      'view.preciseZoom': { canExecute: false },
    });
    const { rerender } = render(
      <CameraControlGroup
        commands={commands}
        bearing={0}
        getZoomState={() => ({ zoom: 9, min: 4, max: 18 })}
        subscribeZoom={noZoomSubscription}
        onZoomChange={() => {}}
      />,
    );
    openPrecise();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();

    rerender(
      <CameraControlGroup
        commands={makeCommands().commands}
        bearing={0}
        getZoomState={noZoomState}
        subscribeZoom={noZoomSubscription}
        onZoomChange={() => {}}
      />,
    );
    openPrecise();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('toggles from the precise zoom command and closes on Escape', () => {
    const { commands } = makeCommands();
    const toggleRef: { current: (() => void) | null } = { current: null };
    render(
      <CameraControlGroup
        commands={commands}
        bearing={0}
        getZoomState={() => ({ zoom: 9, min: 4, max: 18 })}
        subscribeZoom={noZoomSubscription}
        onZoomChange={() => {}}
        toggleRef={toggleRef}
      />,
    );

    act(() => toggleRef.current?.());
    expect(
      screen.getByRole('dialog', { name: 'camera.preciseZoom' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => toggleRef.current?.());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('routes every button through the shared command, not its own camera logic', () => {
    const { commands, executed } = makeCommands();
    render(
      <CameraControlGroup
        commands={commands}
        bearing={0}
        getZoomState={noZoomState}
        subscribeZoom={noZoomSubscription}
        onZoomChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'camera.zoomIn' }));
    fireEvent.click(screen.getByRole('button', { name: 'camera.zoomOut' }));
    fireEvent.click(screen.getByRole('button', { name: 'camera.fitCity' }));

    expect(executed).toEqual(['view.zoomIn', 'view.zoomOut', 'view.fitCity']);
  });

  it('offers reset north only while the map is rotated', () => {
    const { commands } = makeCommands();
    const { rerender } = render(
      <CameraControlGroup
        commands={commands}
        bearing={0}
        getZoomState={noZoomState}
        subscribeZoom={noZoomSubscription}
        onZoomChange={() => {}}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'camera.resetNorth' }),
    ).toBeNull();

    rerender(
      <CameraControlGroup
        commands={commands}
        bearing={42}
        getZoomState={noZoomState}
        subscribeZoom={noZoomSubscription}
        onZoomChange={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'camera.resetNorth' }),
    ).toBeInTheDocument();
  });

  it('disables a control whose command is unavailable', () => {
    const { commands, executed } = makeCommands({
      'view.fitCity': { canExecute: false },
    });
    render(
      <CameraControlGroup
        commands={commands}
        bearing={0}
        getZoomState={noZoomState}
        subscribeZoom={noZoomSubscription}
        onZoomChange={() => {}}
      />,
    );

    const fit = screen.getByRole('button', { name: 'camera.fitCity' });
    expect(fit).toBeDisabled();
    fireEvent.click(fit);
    expect(executed).toEqual([]);
  });

  it('gives every icon-only control a name and a tooltip', () => {
    const { commands } = makeCommands();
    render(
      <CameraControlGroup
        commands={commands}
        bearing={90}
        getZoomState={noZoomState}
        subscribeZoom={noZoomSubscription}
        onZoomChange={() => {}}
      />,
    );

    for (const name of [
      'camera.zoomIn',
      'camera.zoomOut',
      'camera.fitCity',
      'camera.resetNorth',
    ]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'title',
        name,
      );
    }
  });

  it('is a labelled group, so it is announced as one cluster', () => {
    const { commands } = makeCommands();
    render(
      <CameraControlGroup
        commands={commands}
        bearing={0}
        getZoomState={noZoomState}
        subscribeZoom={noZoomSubscription}
        onZoomChange={() => {}}
      />,
    );
    expect(
      screen.getByRole('group', { name: 'a11y.cameraControls' }),
    ).toBeInTheDocument();
  });

  it('reconciles typed out-of-range zoom to the renderer-reported clamp', () => {
    const { commands } = makeCommands();
    let zoomState: MapZoomState | null = { zoom: 5, min: 2, max: 10 };
    const listeners = new Set<() => void>();
    const getZoomState = () => zoomState;
    const subscribeZoom = (callback: () => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    };
    const onZoomChange = (zoom: number) => {
      zoomState = { zoom: Math.min(10, Math.max(2, zoom)), min: 2, max: 10 };
      listeners.forEach((callback) => callback());
    };
    render(
      <CameraControlGroup
        commands={commands}
        bearing={0}
        getZoomState={getZoomState}
        subscribeZoom={subscribeZoom}
        onZoomChange={onZoomChange}
      />,
    );
    openPrecise();

    const input = screen.getByRole('textbox', { name: 'camera.zoomInput' });
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input).toHaveValue('10.0');
    expect(
      screen.getByRole('slider', { name: 'camera.zoomSlider' }),
    ).toHaveValue('10');
  });
});
