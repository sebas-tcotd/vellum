import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '../test-utils';
import { PlatformProvider, usePlatform } from './PlatformContext';
import type { Platform } from './PlatformContext';

function Probe() {
  const { platform } = usePlatform();
  return <span>{platform}</span>;
}

function renderWithPlatform(platform: Platform) {
  return render(
    <PlatformProvider platform={platform}>
      <Probe />
    </PlatformProvider>,
  );
}

const PLATFORMS: readonly Platform[] = ['windows', 'macos', 'linux', 'unknown'];

describe('PlatformContext — renderizado', () => {
  afterEach(() => {
    delete document.documentElement.dataset.platform;
  });

  it.each(PLATFORMS)(
    'expone la plataforma "%s" a través del contexto',
    (platform) => {
      renderWithPlatform(platform);
      expect(screen.getByText(platform)).toBeInTheDocument();
    },
  );

  it.each(PLATFORMS)(
    'setea data-platform="%s" en <html> al montar',
    (platform) => {
      renderWithPlatform(platform);
      expect(document.documentElement.dataset.platform).toBe(platform);
    },
  );

  it('actualiza data-platform en <html> si la prop platform cambia', () => {
    const { rerender } = render(
      <PlatformProvider platform="windows">
        <Probe />
      </PlatformProvider>,
    );
    expect(document.documentElement.dataset.platform).toBe('windows');

    rerender(
      <PlatformProvider platform="macos">
        <Probe />
      </PlatformProvider>,
    );
    expect(document.documentElement.dataset.platform).toBe('macos');
  });
});

describe('PlatformContext — contrato de contexto', () => {
  it('lanza si se usa fuera de PlatformProvider', () => {
    // Silenciamos el error de React en consola para mantener la salida limpia
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow();
    consoleSpy.mockRestore();
  });
});
