import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test-utils';
import { PreferencesPanel } from './PreferencesPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const setLanguage = vi.fn();
const setAutoUpdateEnabled = vi.fn();
const storeState = {
  activeLanguage: 'en' as 'en' | 'es',
  setLanguage,
  autoUpdateEnabled: false,
  setAutoUpdateEnabled,
};

vi.mock('../../store/vellum-store', () => ({
  useVellumStore: (selector: (s: typeof storeState) => unknown) =>
    selector(storeState),
}));

const onOpenChange = vi.fn();

describe('PreferencesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.activeLanguage = 'en';
    storeState.autoUpdateEnabled = false;
  });

  it('renderiza el selector de idioma y el switch de auto-update con los valores actuales', () => {
    render(<PreferencesPanel open onOpenChange={onOpenChange} />);

    expect(
      screen.getByRole('button', { name: 'preferences.language_en' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'preferences.language_es' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('cambiar el idioma llama a setLanguage con el valor correcto', async () => {
    const user = userEvent.setup();
    render(<PreferencesPanel open onOpenChange={onOpenChange} />);

    await user.click(
      screen.getByRole('button', { name: 'preferences.language_es' }),
    );

    expect(setLanguage).toHaveBeenCalledWith('es');
  });

  it('togglear el switch llama a setAutoUpdateEnabled con el valor correcto', async () => {
    const user = userEvent.setup();
    render(<PreferencesPanel open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('switch'));

    expect(setAutoUpdateEnabled).toHaveBeenCalledWith(true);
  });

  it('Escape cierra el panel', async () => {
    const user = userEvent.setup();
    render(<PreferencesPanel open onOpenChange={onOpenChange} />);

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
