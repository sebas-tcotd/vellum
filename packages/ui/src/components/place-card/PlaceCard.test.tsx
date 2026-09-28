import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Copy, Crosshair, Users } from 'lucide-react';
import { cleanup, render, screen, within } from '../../test-utils';
import { PlatformProvider, type Platform } from '../../context/PlatformContext';
import { PlaceCard, type PlaceCardData } from './PlaceCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

const data: PlaceCardData = {
  title: 'Centro',
  subtitle: 'District · Tourism',
  badges: ['Historical'],
  keyFacts: [{ label: 'Population', value: '12,430', icon: Users }],
  sections: [
    {
      kind: 'segments',
      heading: 'Land use',
      segments: [
        { label: 'Homes', value: 3, color: '#66bb6a', displayValue: '3' },
        { label: 'Office jobs', value: 0, color: '#4dd0e1' },
      ],
    },
    { kind: 'rows', rows: [{ label: 'District', value: 'Norte' }] },
  ],
  actions: [
    { id: 'center', label: 'Center', icon: Crosshair, onSelect: vi.fn() },
    { id: 'copy', label: 'Copy', icon: Copy, onSelect: vi.fn() },
  ],
};

function renderOn(platform: Platform, onClose = vi.fn()) {
  return render(
    <PlatformProvider platform={platform}>
      <PlaceCard data={data} onClose={onClose} />
    </PlatformProvider>,
  );
}

describe('PlaceCard', () => {
  it('is a non-modal dialog named by its title and described by its subtitle', () => {
    renderOn('windows');
    const dialog = screen.getByRole('dialog', { name: 'Centro' });
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    expect(dialog).toHaveAccessibleDescription('District · Tourism');
    expect(within(dialog).getByText('Historical')).toBeInTheDocument();
    expect(within(dialog).getByText('12,430')).toBeInTheDocument();
  });

  it('tabs through close, the actions and the sections, in that order', async () => {
    const user = userEvent.setup();
    renderOn('windows');
    await user.tab();
    expect(screen.getByRole('button', { name: 'common.close' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Center' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Copy' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('region', { name: 'Land use' })).toHaveFocus();
  });

  it('closes from its button and runs actions', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderOn('linux', onClose);
    await user.click(screen.getByRole('button', { name: 'common.close' }));
    expect(onClose).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(data.actions[1]!.onSelect).toHaveBeenCalledOnce();
  });

  it('lists every segment with its value, a zero included', () => {
    renderOn('windows');
    const legend = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(legend).toContain('Homes 3');
    expect(legend).toContain('Office jobs 0');
  });

  it('keeps one component tree on every platform', () => {
    // The compositions differ only in CSS: macOS moves the actions to a
    // footer and hides the leading icons.
    const trees = (['macos', 'windows', 'linux'] as const).map((platform) => {
      const { container, unmount } = renderOn(platform);
      // `useId` values differ per root; everything else must be identical.
      const html = container.innerHTML.replace(/_r_[a-z0-9]+_/g, 'ID');
      unmount();
      return html;
    });
    expect(trees[1]).toBe(trees[0]);
    expect(trees[2]).toBe(trees[0]);
  });

  it('announces the place politely without taking focus', () => {
    renderOn('windows');
    const status = document.querySelector('[aria-live="polite"]');
    expect(status).toHaveTextContent('Centro');
    expect(screen.getByRole('dialog')).not.toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it('only headed sections are tab stops', async () => {
    const user = userEvent.setup();
    renderOn('windows');
    for (let i = 0; i < 4; i++) await user.tab();
    expect(screen.getByRole('region', { name: 'Land use' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('dialog')).not.toContainElement(
      document.activeElement as HTMLElement,
    );
    expect(screen.getByText('Norte').closest('section')).not.toHaveAttribute(
      'tabindex',
    );
  });
});
