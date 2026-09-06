import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../test-utils';
import { DocumentCommandGroup } from './DocumentCommandGroup';
import type { CommandRegistry } from '../../shell/commands';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function makeCommands(
  overrides: Partial<Record<string, { canExecute: boolean }>> = {},
): { commands: CommandRegistry; executed: string[] } {
  const executed: string[] = [];
  const registry = Object.fromEntries(
    ['document.open', 'document.export'].map((id) => [
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

describe('document commands', () => {
  it('routes both buttons through the shared commands', () => {
    const { commands, executed } = makeCommands();
    render(<DocumentCommandGroup commands={commands} />);

    fireEvent.click(screen.getByRole('button', { name: 'document.openMap' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'export.exportButton' }),
    );

    expect(executed).toEqual(['document.open', 'document.export']);
  });

  it('gives each icon-only control a name and a tooltip', () => {
    const { commands } = makeCommands();
    render(<DocumentCommandGroup commands={commands} />);

    for (const name of ['document.openMap', 'export.exportButton']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'title',
        name,
      );
    }
  });

  it('disables export while one is already running', () => {
    const { commands, executed } = makeCommands({
      'document.export': { canExecute: false },
    });
    render(<DocumentCommandGroup commands={commands} />);

    const exportButton = screen.getByRole('button', {
      name: 'export.exportButton',
    });
    expect(exportButton).toBeDisabled();
    fireEvent.click(exportButton);
    expect(executed).toEqual([]);

    // Open stays reachable — it is never blocked by an export.
    expect(
      screen.getByRole('button', { name: 'document.openMap' }),
    ).not.toBeDisabled();
  });

  it('is announced as one labelled group', () => {
    const { commands } = makeCommands();
    render(<DocumentCommandGroup commands={commands} />);
    expect(
      screen.getByRole('group', { name: 'a11y.documentCommands' }),
    ).toBeInTheDocument();
  });
});
