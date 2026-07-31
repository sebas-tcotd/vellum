import { useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { useVellumStore, type ExportCancelHandlerRef } from '@vellum/ui';
import type { CityData, VellumError, ParseWarningsPayload } from '@vellum/core';
import { IPC_EVENTS } from '@vellum/core';

/**
 * Hook that wires Tauri IPC file-loading into the VellumStore.
 *
 * Lives in `apps/desktop` (not `@vellum/ui`) so that `@vellum/ui` remains
 * free of direct Tauri runtime dependencies.
 *
 * @param exportCancelHandlerRef - Read (and awaited) right before a newly
 * loaded city replaces the store's `CityData`/DEM, so an active export is
 * always cancelled *before* that shared global mutates (AD-15) — not
 * reactively afterward, which a `useEffect` keyed on `cityData` could never
 * guarantee.
 * @returns `loadFile` — loads a `.cslmap` path via IPC, with anti-race guard.
 * @returns `openFileDialog` — opens the OS file picker, then calls `loadFile`.
 * @returns `loadFilePartial` — retries the last file path with allow_partial=true.
 */

/** Bounded wait for an active export to yield before a new city replaces the store. */
const CANCEL_BEFORE_LOAD_TIMEOUT_MS = 3_000;

/**
 * Cancels any active export *before* this hook touches the store at all —
 * never after, and never unboundedly. A stuck/never-resolving export cancel
 * must not hang a new file load forever; on timeout, the caller keeps the
 * current map untouched and surfaces a localized error instead of loading.
 */
async function cancelActiveExportBeforeLoad(
  exportCancelHandlerRef: ExportCancelHandlerRef | undefined,
): Promise<'ok' | 'timeout'> {
  const cancel = exportCancelHandlerRef?.current;
  if (!cancel) return 'ok';
  const timedOut = Symbol('timeout');
  const result = await Promise.race([
    cancel().then((): 'ok' => 'ok'),
    new Promise<typeof timedOut>((resolve) =>
      setTimeout(() => resolve(timedOut), CANCEL_BEFORE_LOAD_TIMEOUT_MS),
    ),
  ]);
  return result === timedOut ? 'timeout' : 'ok';
}

function toVellumError(err: unknown): VellumError {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as Record<string, unknown>;
    if (e.type === 'UnsupportedVersion' && typeof e.found === 'string') {
      return err as VellumError;
    }
    if (e.type === 'PartialParse' && Array.isArray(e.warnings)) {
      return err as VellumError;
    }
    if (
      (e.type === 'InvalidFile' ||
        e.type === 'IoError' ||
        e.type === 'ExportFailed') &&
      typeof e.reason === 'string'
    ) {
      return err as VellumError;
    }
  }
  return {
    type: 'IoError',
    reason: err instanceof Error ? err.message : String(err),
  };
}

export function useParseCslmap(
  exportCancelHandlerRef?: ExportCancelHandlerRef,
) {
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
      // Cancel before touching the store at all — never reset loadingState
      // or the current map on the strength of a cancellation that hasn't
      // actually happened yet.
      if (
        (await cancelActiveExportBeforeLoad(exportCancelHandlerRef)) ===
        'timeout'
      ) {
        setLoadingState('error', {
          type: 'IoError',
          reason:
            'Timed out waiting for the active export to cancel before loading a new city',
        });
        return;
      }

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

        setCityData({
          ...cityData,
          fileName: fileNameFromPath(filePath),
        }); // also sets loadingState: 'idle' and clears error
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
    [
      incrementLoadRequestId,
      setCityData,
      setLoadingState,
      setDlcWarnings,
      exportCancelHandlerRef,
    ],
  );

  const loadFilePartial = useCallback(async (): Promise<void> => {
    const filePath = lastFilePathRef.current;
    if (!filePath) return;

    if (
      (await cancelActiveExportBeforeLoad(exportCancelHandlerRef)) === 'timeout'
    ) {
      setLoadingState('error', {
        type: 'IoError',
        reason:
          'Timed out waiting for the active export to cancel before loading a new city',
      });
      return;
    }

    const requestId = incrementLoadRequestId();

    let pendingWarnings: string[] = [];
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
        allowPartial: true,
      });

      if (useVellumStore.getState().loadRequestId !== requestId) return;

      setCityData({
        ...cityData,
        fileName: fileNameFromPath(filePath),
      });
      setHasPartialData(true);
      if (pendingWarnings.length > 0) {
        setDlcWarnings(pendingWarnings);
      }
    } catch (err) {
      if (useVellumStore.getState().loadRequestId !== requestId) return;
      const vellumErr = toVellumError(err);
      console.error('[useParseCslmap] Partial parse error:', vellumErr);
      setLoadingState('error', vellumErr);
    } finally {
      cancelled.current = true;
      unlistenRef.current?.();
    }
  }, [
    incrementLoadRequestId,
    setCityData,
    setLoadingState,
    setHasPartialData,
    setDlcWarnings,
    exportCancelHandlerRef,
  ]);

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

function fileNameFromPath(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}
