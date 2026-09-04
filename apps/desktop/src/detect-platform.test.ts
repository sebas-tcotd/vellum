import { describe, expect, it, vi } from 'vitest';
import { detectPlatform } from './detect-platform';

describe('detectPlatform', () => {
  it.each(['windows', 'macos', 'linux'] as const)(
    'pasa "%s" sin cambios',
    (value) => {
      expect(detectPlatform(() => value)).toBe(value);
    },
  );

  it('mapea cualquier plataforma no soportada a "unknown"', () => {
    expect(detectPlatform(() => 'freebsd')).toBe('unknown');
    expect(detectPlatform(() => 'android')).toBe('unknown');
    expect(detectPlatform(() => 'ios')).toBe('unknown');
    expect(detectPlatform(() => '')).toBe('unknown');
  });

  it('cae a "unknown" si getPlatform lanza (detección fallida)', () => {
    expect(
      detectPlatform(() => {
        throw new Error('plugin-os unavailable');
      }),
    ).toBe('unknown');
  });

  it('loguea la falla en consola al caer a "unknown" (I/O matrix: "capturado y logueado")', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    detectPlatform(() => {
      throw new Error('plugin-os unavailable');
    });
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});
