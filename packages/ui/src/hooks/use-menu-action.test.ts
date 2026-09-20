import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { CommandRegistry } from '../shell/commands';
import { useMenuAction } from './use-menu-action';
import { useVellumStore } from '../store/vellum-store';
import { makeCityData } from '@vellum/core/testing';

// The store is module state shared by every test in this file, so it is reset
// unconditionally: a failing assertion must not leave a city loaded for the
// tests that follow it.
afterEach(() => {
  useVellumStore.setState({ cityData: null });
});

describe('useMenuAction', () => {
  it('routes menu.schematic-view to the view.schematic command', () => {
    const execute = vi.fn();
    const commands = new Proxy(
      {},
      {
        get: (_t, id: string) => ({
          id,
          canExecute: true,
          execute: id === 'view.schematic' ? execute : vi.fn(),
        }),
      },
    ) as CommandRegistry;

    const { result } = renderHook(() => useMenuAction({ commands }));
    result.current('menu.schematic-view');

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('leaves the advanced options inert in the schematic view', () => {
    // This branch bypasses the command registry and writes straight to the
    // store, so the schematic needs a guard of its own here. A transit
    // checkmark in the native menu must not be reinterpreted as a schematic
    // filter — that route is the contextual sidebar.
    const commands = new Proxy(
      {},
      { get: (_t, id: string) => ({ id, canExecute: true, execute: vi.fn() }) },
    ) as CommandRegistry;
    useVellumStore.setState({ cityData: makeCityData({}) });
    const before = useVellumStore.getState().layerOptions;

    const { result } = renderHook(() =>
      useMenuAction({ commands, isSchematicView: true }),
    );
    result.current('menu.toggle-advanced.transit.Bus');
    result.current('menu.toggle-advanced.basemap.grid');

    expect(useVellumStore.getState().layerOptions).toBe(before);
  });
});
