import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useVellumStore } from '@vellum/ui';
import type { CityData, VellumError } from '@vellum/core';

/**
 * Hook that wires Tauri IPC file-loading into the VellumStore.
 *
 * Lives in `apps/desktop` (not `@vellum/ui`) so that `@vellum/ui` remains
 * free of direct Tauri runtime dependencies.
 *
 * @returns `loadFile` — loads a `.cslmap` path via IPC, with anti-race guard.
 * @returns `openFileDialog` — opens the OS file picker, then calls `loadFile`.
 */
export function useParseCslmap() {
  const setLoadingState = useVellumStore((s) => s.setLoadingState);
  const setCityData = useVellumStore((s) => s.setCityData);
  const incrementLoadRequestId = useVellumStore(
    (s) => s.incrementLoadRequestId,
  );

  const loadFile = useCallback(
    async (filePath: string): Promise<void> => {
      // incrementLoadRequestId atomically resets state and sets loadingState: 'loading'
      const requestId = incrementLoadRequestId();

      try {
        const cityData = await invoke<CityData>('parse_cslmap', { filePath });

        // Guard: discard stale response if a newer load started
        if (useVellumStore.getState().loadRequestId !== requestId) return;

        setCityData(cityData); // also sets loadingState: 'idle' and clears error
      } catch (err) {
        if (useVellumStore.getState().loadRequestId !== requestId) return;
        setLoadingState('error', err as VellumError);
      }
    },
    [incrementLoadRequestId, setCityData, setLoadingState],
  );

  const openFileDialog = useCallback(async (): Promise<void> => {
    let selected: string | string[] | null;
    try {
      selected = await open({
        title: 'Abrir ciudad',
        filters: [{ name: 'CSL Map', extensions: ['cslmap'] }],
        multiple: false,
      });
    } catch (err) {
      console.error('[useParseCslmap] File dialog failed:', err);
      return;
    }

    if (selected === null) return;

    const filePath = typeof selected === 'string' ? selected : selected[0];
    if (!filePath) return;
    await loadFile(filePath);
  }, [loadFile]);

  return { loadFile, openFileDialog };
}
