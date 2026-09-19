import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { CommandRegistry } from '../shell/commands';
import { useMenuAction } from './use-menu-action';

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
});
