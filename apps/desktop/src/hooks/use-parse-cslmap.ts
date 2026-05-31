import { useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { useVellumStore } from '@vellum/ui';
import type { CityData, VellumError, ParseWarningsPayload } from '@vellum/core';
import { IPC_EVENTS } from '@vellum/core';

/**
 * Hook that wires Tauri IPC file-loading into the VellumStore.
 *
 * Lives in `apps/desktop` (not `@vellum/ui`) so that `@vellum/ui` remains
 * free of direct Tauri runtime dependencies.
 *
 * @returns `loadFile` — loads a `.cslmap` path via IPC, with anti-race guard.
 * @returns `openFileDialog` — opens the OS file picker, then calls `loadFile`.
 * @returns `loadFilePartial` — retries the last file path with allow_partial=true.
 */

function toVellumError(err: unknown): VellumError {
  if (
    err &&
    typeof err === 'object' &&
    'type' in err &&
    typeof err.type === 'string'
  ) {
    return err as VellumError;
  }
  return {
    type: 'IoError',
    reason: err instanceof Error ? err.message : String(err),
  };
}

export function useParseCslmap() {
  const setLoadingState = useVellumStore((s) => s.setLoadingState);
  const setCityData = useVellumStore((s) => s.setCityData);
  const setDlcWarnings = useVellumStore((s) => s.setDlcWarnings);
  const setHasPartialData = useVellumStore((s) => s.setHasPartialData);
  const incrementLoadRequestId = useVellumStore(
    (s) => s.incrementLoadRequestId,
  );

  // Stores the last attempted file path for loadFilePartial
  const lastFilePathRef = useRef<string | null>(null);

  const loadFile = useCallback(
    async (filePath: string): Promise<void> => {
      lastFilePathRef.current = filePath;
      // incrementLoadRequestId atomically resets state and sets loadingState: 'loading'
      const requestId = incrementLoadRequestId();

      // Set up DLC warnings listener BEFORE invoke (event may arrive during parsing)
      let pendingWarnings: string[] = [];
      // Use object refs to avoid TypeScript `never` narrowing on let variables in closures
      const cancelled = { current: false };
      const unlistenRef = { current: null as (() => void) | null };

      listen<ParseWarningsPayload>(IPC_EVENTS.PARSE_WARNINGS, (event) => {
        if (!cancelled.current) {
          pendingWarnings = [...pendingWarnings, ...event.payload.warnings];
        }
      })
        .then((fn) => {
          if (cancelled.current) fn();
          else unlistenRef.current = fn;
        })
        .catch(console.error);

      try {
        const cityData = await invoke<CityData>('parse_cslmap', {
          filePath,
          allowPartial: false,
        });

        // Guard: discard stale response if a newer load started
        if (useVellumStore.getState().loadRequestId !== requestId) return;

        setCityData(cityData); // also sets loadingState: 'idle' and clears error
        if (pendingWarnings.length > 0) {
          setDlcWarnings(pendingWarnings);
        }
      } catch (err) {
        if (useVellumStore.getState().loadRequestId !== requestId) return;
        const vellumErr = toVellumError(err);
        console.error('[useParseCslmap] Parse error:', vellumErr);
        setLoadingState('error', vellumErr);
      } finally {
        cancelled.current = true;
        unlistenRef.current?.();
      }
    },
    [incrementLoadRequestId, setCityData, setLoadingState, setDlcWarnings],
  );

  const loadFilePartial = useCallback(async (): Promise<void> => {
    const filePath = lastFilePathRef.current;
    if (!filePath) return;

    const requestId = incrementLoadRequestId();

    try {
      const cityData = await invoke<CityData>('parse_cslmap', {
        filePath,
        allowPartial: true,
      });

      if (useVellumStore.getState().loadRequestId !== requestId) return;

      setCityData(cityData);
      setHasPartialData(true);
    } catch (err) {
      if (useVellumStore.getState().loadRequestId !== requestId) return;
      const vellumErr = toVellumError(err);
      console.error('[useParseCslmap] Partial parse error:', vellumErr);
      setLoadingState('error', vellumErr);
    }
  }, [incrementLoadRequestId, setCityData, setLoadingState, setHasPartialData]);

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
      setLoadingState('error', toVellumError(err));
      return;
    }

    if (selected === null) return;

    const filePath = typeof selected === 'string' ? selected : selected[0];
    if (!filePath) return;
    await loadFile(filePath);
  }, [loadFile, setLoadingState]);

  return { loadFile, openFileDialog, loadFilePartial };
}
