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
      trafficLightPosition: { x: 22, y: 21 },
      windowEffects: {
        effects: ['sidebar'],
        state: 'followsWindowActiveState',
      },
    });
  });

  it('alinea las traffic lights con el contenido del sidebar flotante', () => {
    // El panel está separado 10 px del borde de la ventana y su cabecera añade
    // 12 px, así que 22 pone los botones sobre la misma línea que el nombre de
    // la ciudad. Si cambia `--shell-sidebar-inset` o el padding de la cabecera,
    // este valor tiene que moverse con ellos.
    const SIDEBAR_INSET = 10;
    const HEADER_PADDING = 12;
    const window = macosConfig.app.windows[0];

    expect(window.trafficLightPosition.x).toBe(SIDEBAR_INSET + HEADER_PADDING);
    // Y dentro de la franja que el sidebar reserva sobre su cabecera, no encima
    // de su borde superior.
    expect(window.trafficLightPosition.y).toBeGreaterThan(SIDEBAR_INSET);
  });

  it('deja Linux en la configuración base opaca y sin efectos emulados', () => {
    const window = baseConfig.app.windows[0];
    expect(window).not.toHaveProperty('transparent');
    expect(window).not.toHaveProperty('windowEffects');
  });
});
