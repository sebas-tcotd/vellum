import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDesktopCommands, type CommandDeps } from './commands';

function deps(overrides: Partial<CommandDeps> = {}): CommandDeps {
  return {
    openFileDialog: vi.fn(),
    openExport: vi.fn(),
    fitToScreen: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetBearing: vi.fn(),
    rotateBy: vi.fn(),
    toggleIconLegend: vi.fn(),
    toggleNavigationMode: vi.fn(),
    toggleLayer: vi.fn(),
    setActiveTheme: vi.fn(),
    setTransitDimmingEnabled: vi.fn(),
    transitDimmingEnabled: false,
    availableThemeIds: ['day', 'transit'],
    toggleCleanView: vi.fn(),
    toggleLayerDetail: vi.fn(),
    hasMap: true,
    isLoading: false,
    isExporting: false,
    ...overrides,
  };
}

const build = (overrides: Partial<CommandDeps> = {}) => {
  const resolved = deps(overrides);
  const { result } = renderHook(() => useDesktopCommands(resolved));
  return { commands: result.current, deps: resolved };
};

describe('availability', () => {
  it('keeps Open reachable with no map, since it is the only way out', () => {
    const { commands } = build({ hasMap: false });
    expect(commands['document.open'].canExecute).toBe(true);
  });

  it('disables map commands with no document and reports why', () => {
    const { commands } = build({ hasMap: false });
    expect(commands['view.fitCity'].canExecute).toBe(false);
    expect(commands['view.fitCity'].unavailableReason).toBe('no-map');
  });

  it('blocks export while one is already running', () => {
    const { commands } = build({ isExporting: true });
    expect(commands['document.export'].unavailableReason).toBe('exporting');
  });

  it('blocks clean view during a blocking load', () => {
    const { commands } = build({ isLoading: true });
    expect(commands['view.cleanView'].unavailableReason).toBe('loading');
  });

  it('keeps style choices reachable with no map, matching the Themes menu', () => {
    const { commands } = build({ hasMap: false });
    expect(commands['style.set'].canExecute).toBe(true);
    expect(commands['style.transitDimming'].canExecute).toBe(true);
  });
});

describe('execution', () => {
  it('is inert when the command is unavailable, whatever surface calls it', () => {
    const { commands, deps: d } = build({ hasMap: false });
    commands['view.zoomIn'].execute();
    commands['document.export'].execute();
    expect(d.zoomIn).not.toHaveBeenCalled();
    expect(d.openExport).not.toHaveBeenCalled();
  });

  it('opening a layer detail never touches that layer visibility', () => {
    const { commands, deps: d } = build();
    commands['layer.detail'].execute('transit');
    expect(d.toggleLayerDetail).toHaveBeenCalledWith('transit');
    expect(d.toggleLayer).not.toHaveBeenCalled();
  });

  it('toggling a layer never opens its detail', () => {
    const { commands, deps: d } = build();
    commands['layer.toggle'].execute('transit');
    expect(d.toggleLayer).toHaveBeenCalledWith('transit');
    expect(d.toggleLayerDetail).not.toHaveBeenCalled();
  });

  it('ignores a theme id that is not loaded', () => {
    const { commands, deps: d } = build();
    commands['style.set'].execute('does-not-exist');
    expect(d.setActiveTheme).not.toHaveBeenCalled();
    commands['style.set'].execute('transit');
    expect(d.setActiveTheme).toHaveBeenCalledWith('transit');
  });

  it('passes the rotation delta through unchanged', () => {
    const { commands, deps: d } = build();
    commands['view.rotate'].execute(-15);
    expect(d.rotateBy).toHaveBeenCalledWith(-15);
  });
});
