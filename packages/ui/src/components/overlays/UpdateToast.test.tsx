import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../test-utils';
import { UpdateToast } from './UpdateToast';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { version?: string }) =>
      key === 'updates.available'
        ? `Vellum ${options?.version} available.`
        : key,
  }),
}));

describe('UpdateToast', () => {
  it('renderiza la versión interpolada (AC1)', () => {
    render(
      <UpdateToast
        version="1.2.0"
        onViewChangelog={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain(
      'Vellum 1.2.0 available.',
    );
  });

  it('clic en "Ver novedades" llama onViewChangelog', () => {
    const onViewChangelog = vi.fn();
    render(
      <UpdateToast
        version="1.2.0"
        onViewChangelog={onViewChangelog}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'updates.viewChangelog' }),
    );
    expect(onViewChangelog).toHaveBeenCalledOnce();
  });

  it('clic en ✕ llama onDismiss', () => {
    const onDismiss = vi.fn();
    render(
      <UpdateToast
        version="1.2.0"
        onViewChangelog={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
