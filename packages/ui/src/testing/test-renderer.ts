// packages/ui/src/testing/test-renderer.ts
// Test double for the injected map renderer. Use it instead of mocking
// `@vellum/renderer-webgl`: `@vellum/ui` no longer imports that package
// (ADR-0001), so a module mock would replace something nothing reaches for.
//
// Vive en `src/testing/` y no en `src/`: importa `vitest`, que es una
// devDependency, y `packages/ui/tsconfig.json` excluye este directorio para
// que `tsc -b` no lo publique en `dist/`.
import { vi, type Mock } from 'vitest';
import type { MapRendererFactory, MapRendererPort } from '@vellum/core';

/** A `MapRendererPort` whose every method is a spy, plus the factory that yields it. */
export interface RendererHarness {
  /** The port instance every `createRenderer` call returns. */
  renderer: MapRendererPort;
  /** The factory to pass as `createRenderer`; stable across renders. */
  createRenderer: MapRendererFactory;
  /** Spy wrapping the factory itself, to assert construction and disposal. */
  factorySpy: Mock<MapRendererFactory>;
  /**
   * Limpia el historial de llamadas de la factory y de **todos** los métodos
   * del puerto, conservando las implementaciones configuradas.
   *
   * @remarks
   * Los tests construyen el harness una sola vez a nivel de módulo (la factory
   * debe tener identidad estable), así que sin esto las llamadas se acumulan
   * entre casos y un `toHaveBeenCalledTimes` mide el test anterior. Llámalo en
   * un `beforeEach`.
   */
  reset: () => void;
}

/**
 * Builds a {@link RendererHarness}.
 *
 * @remarks
 * The port is satisfied structurally, so a test can override any single method
 * without restating the other nineteen. The factory is created once per
 * harness — `MapLibreRoot` keys the renderer's lifetime on its identity, so a
 * per-render factory would remount the map between assertions.
 *
 * @param overrides - Methods to replace on the returned port.
 * @returns The harness.
 */
export function createRendererHarness(
  overrides: Partial<MapRendererPort> = {},
): RendererHarness {
  const renderer: MapRendererPort = {
    render: vi.fn().mockResolvedValue(undefined),
    updateViewport: vi.fn(),
    resize: vi.fn(),
    applyTheme: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    fitToScreen: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    rotateBy: vi.fn(),
    resetBearing: vi.fn(),
    toggleNavigationMode: vi.fn(),
    navigateTo: vi.fn(),
    getBearing: vi.fn().mockReturnValue(0),
    getInitialViewportBounds: vi.fn().mockReturnValue(null),
    setViewportPadding: vi.fn(),
    clear: vi.fn(),
    setLayerVisibility: vi.fn(),
    setLayerOptions: vi.fn(),
    setTransitDimming: vi.fn(),
    setWatermarkVisibility: vi.fn(),
    subscribeViewport: vi.fn().mockReturnValue(() => {}),
    subscribeHover: vi.fn().mockReturnValue(() => {}),
    subscribeServiceIconLegend: vi.fn().mockReturnValue(() => {}),
    capturePreview: vi.fn().mockResolvedValue(null),
    createExportSnapshot: vi.fn().mockReturnValue(null),
    createSvgExportSnapshot: vi.fn().mockReturnValue(null),
    ...overrides,
  };

  const factorySpy: Mock<MapRendererFactory> = vi.fn(() => renderer);

  return {
    renderer,
    createRenderer: factorySpy,
    factorySpy,
    reset: () => {
      factorySpy.mockClear();
      for (const method of Object.values(renderer)) {
        if (vi.isMockFunction(method)) method.mockClear();
      }
    },
  };
}
