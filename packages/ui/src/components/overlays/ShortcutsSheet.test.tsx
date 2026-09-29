import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '../../test-utils';
import { PlatformProvider } from '../../context/PlatformContext';
import { ShortcutsSheet } from './ShortcutsSheet';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderSheet = (platform: 'macos' | 'windows') =>
  render(
    <PlatformProvider platform={platform}>
      <ShortcutsSheet open onOpenChange={() => {}} />
    </PlatformProvider>,
  );

/** The key caps shown next to a row's label. */
const capsOf = (label: string) =>
  within(screen.getByText(label).nextElementSibling as HTMLElement)
    .getAllByText(/.+/, { selector: 'kbd' })
    .map((kbd) => kbd.textContent);

describe('ShortcutsSheet', () => {
  it('leads with the share hint: hide the interface and export', () => {
    renderSheet('macos');
    expect(screen.getByText('shortcuts.share.title')).toBeInTheDocument();
    expect(screen.getByText('shortcuts.share.hide')).toBeInTheDocument();
    expect(screen.getByText('shortcuts.share.export')).toBeInTheDocument();
  });

  it('writes modifiers the way the platform does', () => {
    renderSheet('macos');
    expect(capsOf('shortcuts.actions.preciseZoom')).toEqual(['⌥', '⌘', 'Z']);
  });

  it('uses Ctrl/Alt names off macOS', () => {
    renderSheet('windows');
    expect(capsOf('shortcuts.actions.preciseZoom')).toEqual([
      'Ctrl',
      'Alt',
      'Z',
    ]);
  });

  it('folds the seven layer keys into one row each', () => {
    renderSheet('macos');
    expect(capsOf('shortcuts.actions.layerToggle')).toEqual(['1–7']);
    expect(capsOf('shortcuts.actions.layerDetail')).toEqual(['⇧', '1–7']);
  });
});
