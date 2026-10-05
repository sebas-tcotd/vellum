import { useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { resolveResource } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { useVellumStore, type ExportCancelHandlerRef } from '@vellum/ui';
import type { CityData, VellumError, ParseWarningsPayload } from '@vellum/core';
import { IPC_COMMANDS, IPC_EVENTS } from '@vellum/core';
import { SAMPLE_CITY } from '../sample-city';

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
 * @returns `loadFile` — loads a `.cslmap` or `.vellummap` path via IPC, with anti-race guard.
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

/** Shares protected document loading between file paths, retries, and bundled resources. */
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
  // Reserve intent before cancellation or path resolution can yield. The store
  // request id is reserved only after export cancellation permits mutation.
  const loadIntentRef = useRef(0);

  const loadCity = useCallback(
    async (
      resolvePath: () => Promise<string>,
      allowPartial = false,
    ): Promise<void> => {
      const intent = ++loadIntentRef.current;
      // Cancel before touching the store at all — never reset loadingState
      // or the current map on the strength of a cancellation that hasn't
      // actually happened yet.
      const cancellation = await cancelActiveExportBeforeLoad(
        exportCancelHandlerRef,
      );
      if (loadIntentRef.current !== intent) return;
      if (cancellation === 'timeout') {
        setLoadingState('error', {
          type: 'IoError',
          reason:
            'Timed out waiting for the active export to cancel before loading a new city',
        });
        return;
      }

      lastFilePathRef.current = null;
      // incrementLoadRequestId atomically resets state and sets loadingState: 'loading'
      const requestId = incrementLoadRequestId();

      // Set up DLC warnings listener BEFORE invoke (event may arrive during parsing)
      let pendingWarnings: string[] = [];
      // Use object refs to avoid TypeScript `never` narrowing on let variables in closures
      const cancelled = { current: false };
      const unlistenRef = { current: null as (() => void) | null };

      try {
        const filePath = await resolvePath();
        if (
          loadIntentRef.current !== intent ||
          useVellumStore.getState().loadRequestId !== requestId
        )
          return;
        lastFilePathRef.current = filePath;
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

        const cityData = await invoke<CityData>(IPC_COMMANDS.PARSE_CSLMAP, {
          filePath,
          allowPartial,
        });

        // Guard: discard stale response if a newer load started
        if (
          loadIntentRef.current !== intent ||
          useVellumStore.getState().loadRequestId !== requestId
        )
          return;

        setCityData({
          ...cityData,
          fileName: fileNameFromPath(filePath),
        }); // also sets loadingState: 'idle' and clears error
        if (allowPartial) setHasPartialData(true);
        if (pendingWarnings.length > 0) {
          setDlcWarnings(pendingWarnings);
        }
      } catch (err) {
        if (
          loadIntentRef.current !== intent ||
          useVellumStore.getState().loadRequestId !== requestId
        )
          return;
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
      setHasPartialData,
      exportCancelHandlerRef,
    ],
  );

  const loadFile = useCallback(
    (filePath: string): Promise<void> => loadCity(async () => filePath),
    [loadCity],
  );

  const openSampleCity = useCallback(
    (): Promise<void> =>
      loadCity(() => resolveResource(SAMPLE_CITY.resourcePath)),
    [loadCity],
  );

  const loadFilePartial = useCallback(async (): Promise<void> => {
    const filePath = lastFilePathRef.current;
    if (filePath) await loadCity(async () => filePath, true);
  }, [loadCity]);

  const openFileDialog = useCallback(async (): Promise<void> => {
    let selected: string | string[] | null;
    try {
      selected = await open({
        title: 'Abrir ciudad',
        // One filter for both: the native document first, the legacy
        // `.cslmap` still opens through the same command.
        filters: [{ name: 'Ciudad', extensions: ['vellummap', 'cslmap'] }],
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

  return { loadFile, openFileDialog, loadFilePartial, openSampleCity };
}

function fileNameFromPath(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}
