import { DEFAULT_RENDER_STYLE_PARAMS } from '@vellum/theme-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '../test-utils';
import { useThemes } from './use-themes';

import { createPlatformServicesHarness } from '../testing/test-platform-services';

let harness = createPlatformServicesHarness();
let invokeMock = harness.invoke;

const setAvailableThemes = vi.fn();
const setThemeWarnings = vi.fn();
vi.mock('../store/vellum-store', () => ({
  useVellumStore: (selector: (s: unknown) => unknown) =>
    selector({ setAvailableThemes, setThemeWarnings }),
}));

const validJson = (name: string) =>
  JSON.stringify({ schemaVersion: 1, name, ...DEFAULT_RENDER_STYLE_PARAMS });

beforeEach(() => {
  vi.clearAllMocks();
  harness = createPlatformServicesHarness();
  invokeMock = harness.invoke;
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('useThemes', () => {
  it('loads valid themes, populates the store, and skips invalid ones with warnings', async () => {
    invokeMock.mockResolvedValue([
      { id: 'day', source: 'built-in', rawJson: validJson('Day') },
      { id: 'bad', source: 'user', rawJson: '{ not json' },
    ]);

    const { result } = renderHook(() => useThemes(), {
      wrapper: harness.wrapper,
    });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(invokeMock).toHaveBeenCalledWith('load_themes');
    expect(result.current[0]?.id).toBe('day');
    expect(setAvailableThemes).toHaveBeenCalledWith([
      { id: 'day', name: 'Day', source: 'built-in' },
    ]);
    expect(setThemeWarnings).toHaveBeenCalledWith([
      { themeId: 'bad', themeName: 'bad', field: 'JSON' },
    ]);
  });

  it('does not throw when the IPC command rejects', async () => {
    invokeMock.mockRejectedValue(new Error('ipc down'));
    const { result } = renderHook(() => useThemes(), {
      wrapper: harness.wrapper,
    });
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it('does not throw when the IPC command resolves with a non-array', async () => {
    invokeMock.mockResolvedValue(null);
    const { result } = renderHook(() => useThemes(), {
      wrapper: harness.wrapper,
    });
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(result.current).toEqual([]);
    expect(setAvailableThemes).not.toHaveBeenCalled();
  });
});
