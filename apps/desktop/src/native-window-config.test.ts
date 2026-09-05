import { describe, expect, it } from 'vitest';
import baseConfig from '../src-tauri/tauri.conf.json';
import macosConfig from '../src-tauri/tauri.macos.conf.json';
import windowsConfig from '../src-tauri/tauri.windows.conf.json';

describe('configuración de ventana nativa Story 8.2', () => {
  it('habilita Mica sin Acrylic únicamente en el override de Windows', () => {
    const window = windowsConfig.app.windows[0];
    expect(window?.transparent).toBe(true);
    expect(window?.windowEffects?.effects).toEqual(['mica']);
    expect(window?.windowEffects?.effects).not.toContain('acrylic');
  });

  it('conserva decoraciones, traffic lights y vibrancy sidebar en macOS', () => {
    const window = macosConfig.app.windows[0];
    expect(macosConfig.app.macOSPrivateApi).toBe(true);
    expect(window).toMatchObject({
      transparent: true,
      decorations: true,
      titleBarStyle: 'Overlay',
      hiddenTitle: true,
      trafficLightPosition: { x: 14, y: 18 },
      windowEffects: {
        effects: ['sidebar'],
        state: 'followsWindowActiveState',
      },
    });
  });

  it('deja Linux en la configuración base opaca y sin efectos emulados', () => {
    const window = baseConfig.app.windows[0];
    expect(window).not.toHaveProperty('transparent');
    expect(window).not.toHaveProperty('windowEffects');
  });
});
