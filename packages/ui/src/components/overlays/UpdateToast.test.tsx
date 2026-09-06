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

  it('sin onInstall no ofrece instalar (auto-update apagado)', () => {
    render(
      <UpdateToast
        version="1.2.0"
        onViewChangelog={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'updates.install' }),
    ).toBeNull();
  });

  it('instalar llama onInstall y deshabilita el botón mientras corre', async () => {
    const onInstall = vi.fn(() => new Promise<void>(() => {}));
    render(
      <UpdateToast
        version="1.2.0"
        onViewChangelog={vi.fn()}
        onInstall={onInstall}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'updates.install' }));
    expect(onInstall).toHaveBeenCalledOnce();

    const installing = await screen.findByRole('button', {
      name: 'updates.installing',
    });
    expect(installing).toBeDisabled();
  });

  it('un fallo de instalación se muestra en vez de morir en silencio', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <UpdateToast
        version="1.2.0"
        onViewChangelog={vi.fn()}
        onInstall={() => Promise.reject(new Error('UAC declined'))}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'updates.install' }));

    expect(
      await screen.findByText('updates.installFailed'),
    ).toBeInTheDocument();
    // El botón desaparece: reintentar el mismo install fallido no ayuda,
    // el mensaje manda al usuario a la descarga manual.
    expect(
      screen.queryByRole('button', { name: 'updates.install' }),
    ).toBeNull();
  });
});
