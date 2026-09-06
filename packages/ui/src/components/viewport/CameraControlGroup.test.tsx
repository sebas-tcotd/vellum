import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../test-utils';
import { CameraControlGroup } from './CameraControlGroup';
import type { CommandRegistry } from '../../shell/commands';

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
  it('routes every button through the shared command, not its own camera logic', () => {
    const { commands, executed } = makeCommands();
    render(<CameraControlGroup commands={commands} bearing={0} />);

    fireEvent.click(screen.getByRole('button', { name: 'camera.zoomIn' }));
    fireEvent.click(screen.getByRole('button', { name: 'camera.zoomOut' }));
    fireEvent.click(screen.getByRole('button', { name: 'camera.fitCity' }));

    expect(executed).toEqual(['view.zoomIn', 'view.zoomOut', 'view.fitCity']);
  });

  it('offers reset north only while the map is rotated', () => {
    const { commands } = makeCommands();
    const { rerender } = render(
      <CameraControlGroup commands={commands} bearing={0} />,
    );
    expect(
      screen.queryByRole('button', { name: 'camera.resetNorth' }),
    ).toBeNull();

    rerender(<CameraControlGroup commands={commands} bearing={42} />);
    expect(
      screen.getByRole('button', { name: 'camera.resetNorth' }),
    ).toBeInTheDocument();
  });

  it('disables a control whose command is unavailable', () => {
    const { commands, executed } = makeCommands({
      'view.fitCity': { canExecute: false },
    });
    render(<CameraControlGroup commands={commands} bearing={0} />);

    const fit = screen.getByRole('button', { name: 'camera.fitCity' });
    expect(fit).toBeDisabled();
    fireEvent.click(fit);
    expect(executed).toEqual([]);
  });

  it('gives every icon-only control a name and a tooltip', () => {
    const { commands } = makeCommands();
    render(<CameraControlGroup commands={commands} bearing={90} />);

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
    render(<CameraControlGroup commands={commands} bearing={0} />);
    expect(
      screen.getByRole('group', { name: 'a11y.cameraControls' }),
    ).toBeInTheDocument();
  });
});
