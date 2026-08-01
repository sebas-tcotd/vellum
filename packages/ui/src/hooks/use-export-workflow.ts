import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CityData,
  ExportDialogOptions,
  ExportPreviewSnapshot,
  ExportProgress,
  ExportRequest,
  ExportResult,
  ExportSnapshot,
  RasterExportV2,
  VellumError,
} from '@vellum/core';
import type { ExportCancelHandlerRef } from '../App';
import { useVellumStore } from '../store/vellum-store';

/** Bounded time an export may run before it is treated as timed out and aborted. */
const EXPORT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Stable `VellumError.reason` sentinel for a `capabilitiesForSnapshot` bail-out.
 *
 * @remarks
 * Matched by identity (not displayed) so `ExportStatusOverlay` can show the
 * actionable `errors.ExportCapacityUnavailable` copy instead of the generic
 * `errors.ExportFailed` one — this never crosses the Rust IPC boundary, so
 * it isn't part of the mirrored `VellumError` contract.
 */
export const EXPORT_CAPACITY_UNAVAILABLE_REASON = 'export-capacity-unavailable';

/** Maps an export failure to the existing `errors.*` i18n keys — never `.reason`. */
function toExportError(err: unknown): VellumError {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as Record<string, unknown>;
    if (
      (e.type === 'ExportFailed' || e.type === 'IoError') &&
      typeof e.reason === 'string'
    ) {
      return err as VellumError;
    }
  }
  return {
    type: 'ExportFailed',
    reason: err instanceof Error ? err.message : String(err),
  };
}

export interface UseExportWorkflowParams {
  cityData: CityData | null;
  loadingState: string;
  rasterExporter?: RasterExportV2 | undefined;
  exportCancelHandlerRef?: ExportCancelHandlerRef | undefined;
  previewCaptureRef: React.RefObject<
    (() => Promise<ExportPreviewSnapshot | null>) | null
  >;
  snapshotCaptureRef: React.RefObject<
    ((request: ExportRequest) => ExportSnapshot | null) | null
  >;
  isExportingProp: boolean;
}

/**
 * Owns the export state machine: dialog visibility, in-flight phase/progress,
 * terminal outcomes (result/cancelled/error), and the timeout+abort plumbing
 * shared between `handleExport` and window-close cancellation.
 */
export function useExportWorkflow({
  cityData,
  loadingState,
  rasterExporter,
  exportCancelHandlerRef,
  previewCaptureRef,
  snapshotCaptureRef,
  isExportingProp,
}: UseExportWorkflowParams) {
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportPreview, setExportPreview] =
    useState<ExportPreviewSnapshot | null>(null);
  const [exportPhase, setExportPhase] = useState<
    'idle' | 'exporting' | 'cancelling'
  >('idle');
  const isExporting = isExportingProp || exportPhase !== 'idle';
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(
    null,
  );
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportCancelled, setExportCancelled] = useState(false);
  const [exportError, setExportError] = useState<VellumError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const exportOperationRef = useRef<{
    snapshotId: string;
    sessionId?: string;
  } | null>(null);
  const timedOutRef = useRef(false);
  const pendingExportRef = useRef<Promise<void> | null>(null);
  const isExportingRef = useRef(isExporting);
  isExportingRef.current = isExporting;
  const previewCapturePendingRef = useRef(false);

  /**
   * Cancels any active export before this render commits — never after,
   * since the caller (an effect reacting to `cityData`) already means the
   * global CityData/DEM is about to be replaced (AD-15: one export at a time
   * while that protocol is shared).
   */
  const handleCancelExport = useCallback((): void => {
    if (!abortControllerRef.current) return;
    setExportPhase('cancelling');
    abortControllerRef.current.abort();
  }, []);

  // Reset clean mode when a new map is loaded so the chrome is always visible on first render
  useEffect(() => {
    setIsExportDialogOpen(false);
    setExportPreview(null);
    handleCancelExport();
  }, [cityData, handleCancelExport]);

  // Clears the composition-root cancel bridge on unmount — set/cleared
  // synchronously by `handleExport` itself the rest of the time (never via a
  // passive effect: a window-close race could otherwise see a stale `null`
  // in the gap between starting the export and an effect actually running).
  useEffect(() => {
    return () => {
      if (exportCancelHandlerRef) exportCancelHandlerRef.current = null;
    };
  }, [exportCancelHandlerRef]);

  // Escape cancels an active export once the configuration dialog itself has
  // already closed (Radix's own onOpenChange handles Escape while it's open).
  useEffect(() => {
    if (exportPhase === 'idle') return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      handleCancelExport();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exportPhase, handleCancelExport]);

  useEffect(() => {
    if (loadingState !== 'loading') return;
    setIsExportDialogOpen(false);
    setExportPreview(null);
  }, [loadingState]);

  const handleOpenExport = useCallback(async () => {
    if (
      cityData === null ||
      loadingState === 'loading' ||
      isExportingRef.current ||
      previewCapturePendingRef.current
    ) {
      return;
    }
    previewCapturePendingRef.current = true;
    try {
      const preview = await (previewCaptureRef.current?.() ??
        Promise.resolve(null));
      const currentState = useVellumStore.getState();
      if (
        currentState.cityData !== cityData ||
        currentState.loadingState === 'loading' ||
        isExportingRef.current
      ) {
        return;
      }
      setExportPreview(preview);
      setIsExportDialogOpen(true);
    } finally {
      previewCapturePendingRef.current = false;
    }
  }, [cityData, loadingState, previewCaptureRef]);

  const handleExport = useCallback(
    async (options: ExportDialogOptions): Promise<void> => {
      if (isExportingRef.current || !rasterExporter) return;
      if (options.format === 'svg') {
        setExportError({
          type: 'ExportFailed',
          reason: 'SVG export is not implemented',
        });
        return;
      }
      const request: ExportRequest =
        options.area === 'full-map'
          ? {
              format: options.format,
              area: options.area,
              targetLongEdge: options.targetLongEdge,
              background: options.background,
              fileName: options.fileName,
              presentation: options.presentation,
            }
          : {
              format: options.format,
              area: options.area,
              background: options.background,
              fileName: options.fileName,
              presentation: options.presentation,
            };
      setExportError(null);
      setExportCancelled(false);
      setExportResult(null);
      setExportProgress(null);
      timedOutRef.current = false;
      // The one terminal, localized outcome for anything the AbortSignal
      // covers — a thrown AbortError, or a promise that raced to success
      // just behind abort() — so neither path can leave the UI silently
      // stuck without a toast.
      const finalizeAbortedOutcome = (): void => {
        if (timedOutRef.current) {
          setExportError({ type: 'ExportFailed', reason: 'export timed out' });
        } else {
          setExportCancelled(true);
        }
      };
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setExportPhase('exporting');
      let resolvePending: (() => void) | undefined;
      pendingExportRef.current = new Promise((resolve) => {
        resolvePending = resolve;
      });
      // Set synchronously — never via a passive effect — so a composition
      // root (main.tsx's window-close handler, or the city-load guard) can
      // never observe a stale `null` in the gap before an effect runs.
      if (exportCancelHandlerRef) {
        exportCancelHandlerRef.current = async () => {
          handleCancelExport();
          await (pendingExportRef.current ?? Promise.resolve());
        };
      }
      const timeoutId = window.setTimeout(() => {
        timedOutRef.current = true;
        setExportPhase('cancelling');
        controller.abort();
      }, EXPORT_TIMEOUT_MS);
      try {
        const snapshot = snapshotCaptureRef.current?.(request);
        if (!snapshot) throw new Error('Export snapshot is unavailable');
        // Falsifiable, unlike `capabilities(request)`: it evaluates the real
        // captured surface, so an oversized legacy surface or a rejected
        // tile plan actually shows up here instead of only failing later
        // inside `export()`.
        const capabilities = rasterExporter.capabilitiesForSnapshot(snapshot);
        if (!capabilities.legacy.eligible && !capabilities.tiled.eligible) {
          throw new Error(EXPORT_CAPACITY_UNAVAILABLE_REASON);
        }
        exportOperationRef.current = { snapshotId: snapshot.snapshotId };
        const onProgress = (progress: ExportProgress): void => {
          // A cancelled/aborted operation never advances progress again,
          // regardless of identity — a callback racing just behind abort()
          // must not resurrect the UI out of "Cancelando…".
          if (controller.signal.aborted) return;
          const current = exportOperationRef.current;
          if (!current || current.snapshotId !== progress.snapshotId) return;
          // Once the session is known, a progress event must match it too —
          // a same-snapshotId event from a different session is never ours.
          if (
            current.sessionId !== undefined &&
            progress.sessionId !== undefined &&
            current.sessionId !== progress.sessionId
          ) {
            return;
          }
          exportOperationRef.current = {
            snapshotId: progress.snapshotId,
            ...(progress.sessionId !== undefined
              ? { sessionId: progress.sessionId }
              : {}),
          };
          setExportProgress(progress);
        };
        const receipt = await rasterExporter.export(
          snapshot,
          controller.signal,
          onProgress,
        );
        if (exportOperationRef.current?.snapshotId !== snapshot.snapshotId) {
          return;
        }
        // A receipt is the transactional authority: if `finish()` committed
        // before cancellation reached Rust, the file exists and UI must never
        // claim it was cancelled.
        setExportError(null);
        setExportCancelled(false);
        setExportResult(receipt);
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          finalizeAbortedOutcome();
        } else {
          console.error('[App] PNG export failed:', error);
          setExportError(toExportError(error));
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        if (exportCancelHandlerRef) exportCancelHandlerRef.current = null;
        exportOperationRef.current = null;
        setExportProgress(null);
        setExportPhase('idle');
        resolvePending?.();
      }
    },
    [
      rasterExporter,
      exportCancelHandlerRef,
      handleCancelExport,
      snapshotCaptureRef,
    ],
  );

  return {
    isExporting,
    isExportDialogOpen,
    setIsExportDialogOpen,
    exportPreview,
    exportPhase,
    exportProgress,
    exportResult,
    exportCancelled,
    exportError,
    handleCancelExport,
    handleOpenExport,
    handleExport,
  };
}
