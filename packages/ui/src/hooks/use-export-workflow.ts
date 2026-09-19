import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParseKeys } from 'i18next';
import type {
  CityData,
  ExportDialogOptions,
  ExportPreviewOptions,
  ExportPreviewSnapshot,
  ExportProgress,
  ExportProgressCallback,
  ExportReceipt,
  ExportRequest,
  ExportResult,
  ExportSnapshot,
  RasterExportV2,
  SvgExportPort,
  SvgExportRequest,
  SvgExportSnapshot,
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

/**
 * Stable `VellumError.reason` sentinels for the SVG capability rejections.
 *
 * @remarks
 * Matched by identity, never displayed — `ExportStatusOverlay` maps each to its
 * own `errors.*` key so a tilted camera reads as "flatten the view first"
 * rather than as a generic failure. Like the raster sentinel above, these never
 * cross the Rust IPC boundary.
 */
export const SVG_UNSUPPORTED_CAMERA_REASON = 'svg-unsupported-camera';
/** Sentinel for an SVG request the exporter cannot size or bound. */
export const SVG_UNSUPPORTED_AREA_REASON = 'svg-unsupported-area';

/**
 * Capability sentinels that are expected outcomes, not bugs.
 *
 * @remarks
 * These reach the UI as an actionable localized message, so logging a stack
 * trace for them would only add noise to a console the user may be reading.
 */
const SILENT_CAPABILITY_REASONS = new Set([
  EXPORT_CAPACITY_UNAVAILABLE_REASON,
  SVG_UNSUPPORTED_CAMERA_REASON,
  SVG_UNSUPPORTED_AREA_REASON,
]);

/**
 * Turns dialog options into the request its route actually accepts.
 *
 * @remarks
 * The one place the dialog's shape is converted, so an invalid combination —
 * a `full-map` raster without `targetLongEdge`, or an SVG carrying a raster
 * density — cannot be constructed anywhere else.
 */
function buildExportRequest(
  options: ExportDialogOptions,
): ExportRequest | SvgExportRequest {
  const shared = {
    area: options.area,
    background: options.background,
    fileName: options.fileName,
    presentation: options.presentation,
    // Resolved by the dialog in the active language: core lays these strings
    // out verbatim on every route, and never translates anything itself.
    labels: options.labels,
  } as const;

  if (options.format === 'svg') {
    return options.area === 'full-map'
      ? {
          ...shared,
          area: 'full-map',
          format: 'svg',
          targetLongEdge: options.targetLongEdge,
        }
      : { ...shared, area: 'viewport', format: 'svg' };
  }
  return options.area === 'full-map'
    ? {
        ...shared,
        area: 'full-map',
        format: options.format,
        targetLongEdge: options.targetLongEdge,
      }
    : { ...shared, area: 'viewport', format: options.format };
}

/** A captured, pre-validated operation, ready to hand to its exporter. */
interface PreparedExport {
  /** Identity used to correlate progress and discard stale callbacks. */
  readonly snapshotId: string;
  /** Runs the export against the already-validated snapshot. */
  readonly start: (
    signal: AbortSignal,
    onProgress: ExportProgressCallback,
  ) => Promise<ExportReceipt>;
}

/**
 * Captures and pre-validates a raster operation.
 *
 * @remarks
 * `capabilitiesForSnapshot` is falsifiable, unlike `capabilities(request)`: it
 * evaluates the real captured surface, so an oversized legacy surface or a
 * rejected tile plan shows up here instead of only failing inside `export()`.
 */
function prepareRasterExport(
  request: ExportRequest,
  route: {
    capture: ((request: ExportRequest) => ExportSnapshot | null) | null;
    exporter: RasterExportV2;
  },
): PreparedExport {
  const snapshot = route.capture?.(request);
  if (!snapshot) throw new Error('Export snapshot is unavailable');
  const capabilities = route.exporter.capabilitiesForSnapshot(snapshot);
  if (!capabilities.legacy.eligible && !capabilities.tiled.eligible) {
    throw new Error(EXPORT_CAPACITY_UNAVAILABLE_REASON);
  }
  return {
    snapshotId: snapshot.snapshotId,
    start: (signal, onProgress) =>
      route.exporter.export(snapshot, signal, onProgress),
  };
}

/**
 * Captures and pre-validates a vector operation.
 *
 * @remarks
 * Runs the exact check the exporter is about to run, so an unsupported camera
 * is reported before a worker or a Rust session ever exists (AC 9) — it is
 * never silently flattened into a top-down view.
 */
function prepareSvgExport(
  request: SvgExportRequest,
  route: {
    capture: ((request: SvgExportRequest) => SvgExportSnapshot | null) | null;
    exporter: SvgExportPort;
  },
): PreparedExport {
  const snapshot = route.capture?.(request);
  if (!snapshot) throw new Error('Export snapshot is unavailable');
  const decision = route.exporter.capabilitiesForSnapshot(snapshot);
  if (!decision.eligible) {
    throw new Error(
      decision.reason === 'camera-pitch' || decision.reason === 'camera-bearing'
        ? SVG_UNSUPPORTED_CAMERA_REASON
        : SVG_UNSUPPORTED_AREA_REASON,
    );
  }
  return {
    snapshotId: snapshot.snapshotId,
    start: (signal, onProgress) =>
      route.exporter.export(snapshot, signal, onProgress),
  };
}

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
  /** Vector exporter; when absent, choosing SVG reports an actionable error. */
  svgExporter?: SvgExportPort | undefined;
  exportCancelHandlerRef?: ExportCancelHandlerRef | undefined;
  previewCaptureRef: React.RefObject<
    | ((options: ExportPreviewOptions) => Promise<ExportPreviewSnapshot | null>)
    | null
  >;
  snapshotCaptureRef: React.RefObject<
    ((request: ExportRequest) => ExportSnapshot | null) | null
  >;
  /** Captures the vector counterpart of `snapshotCaptureRef`. */
  svgSnapshotCaptureRef?: React.RefObject<
    ((request: SvgExportRequest) => SvgExportSnapshot | null) | null
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
  svgExporter,
  exportCancelHandlerRef,
  previewCaptureRef,
  snapshotCaptureRef,
  svgSnapshotCaptureRef,
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
  // Typed as i18n keys, not free strings: the compiler then rejects a warning
  // the translation files never got, which is the failure mode this state had
  // while nothing rendered it.
  const [exportWarnings, setExportWarnings] = useState<readonly ParseKeys[]>(
    [],
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const exportOperationRef = useRef<{
    snapshotId: string;
    sessionId?: string;
  } | null>(null);
  const timedOutRef = useRef(false);
  const pendingExportRef = useRef<Promise<void> | null>(null);
  // Mirrors `isExporting` for callbacks that must not close over a stale
  // render, and `handleExport` also raises it *synchronously* when an
  // operation starts. Both matter: `setExportPhase` only lands on the next
  // render, so two clicks dispatched in the same tick would otherwise both
  // pass the guard and start a second export — which AD-15 forbids while the
  // DEM protocol is global. Re-assigning on every render keeps it honest
  // afterwards, since by then `exportPhase` carries the same answer.
  const isExportingRef = useRef(isExporting);
  isExportingRef.current = isExporting;
  // Unlike `isExportingRef`, this tracks only the externally-driven signal,
  // never `exportPhase` — `handleOpenExport` needs to tell "an export started
  // outside this dialog while its preview was still loading" (close the
  // dialog it eagerly opened) apart from "the user just confirmed the export
  // this same dialog is showing" (exportPhase leaving idle, which must not
  // close the dialog it's the progress UI for).
  const isExportingPropRef = useRef(isExportingProp);
  isExportingPropRef.current = isExportingProp;
  const previewCapturePendingRef = useRef(false);
  // The rendered mirror of `previewCapturePendingRef`. A preview is now a full
  // WebGL render on a disposable surface, so it takes long enough that the
  // dialog has to say it is working — the ref alone never re-renders anything.
  const [isPreviewCapturing, setIsPreviewCapturing] = useState(false);
  /**
   * Monotonic id of the newest preview capture that was asked for.
   *
   * @remarks
   * A capture can outlive the choice that started it — the user switches
   * option again, or closes the dialog, while a render is still in flight.
   * Bumping this is how those results are abandoned instead of landing on top
   * of a composition nobody is looking at any more.
   */
  const previewRequestIdRef = useRef(0);

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

  // Closing the dialog abandons whatever preview was still rendering: its
  // result describes a configuration that is no longer on screen, and the next
  // open starts from a blank preview anyway.
  useEffect(() => {
    if (isExportDialogOpen) return;
    previewRequestIdRef.current += 1;
    previewCapturePendingRef.current = false;
    setIsPreviewCapturing(false);
  }, [isExportDialogOpen]);

  /**
   * Runs one preview capture and applies it only if it is still the current one.
   *
   * @remarks
   * The single capture path for every preview the dialog ever shows — the
   * first one it asks for on open, and each recapture the user's choices
   * trigger. Both go through `previewCaptureRef` with the composition they
   * mean, so neither can end up describing something the file would not.
   *
   * Staleness is decided by request identity, not by the promise that
   * resolves first: each call claims the next id, and a result whose id is no
   * longer current belongs to a composition the user has already left behind.
   */
  const runPreviewCapture = useCallback(
    (options: ExportPreviewOptions): void => {
      if (
        cityData === null ||
        loadingState === 'loading' ||
        isExportingRef.current
      ) {
        return;
      }
      const requestId = previewRequestIdRef.current + 1;
      previewRequestIdRef.current = requestId;
      previewCapturePendingRef.current = true;
      setIsPreviewCapturing(true);
      void (previewCaptureRef.current?.(options) ?? Promise.resolve(null))
        .then((preview) => {
          if (previewRequestIdRef.current !== requestId) return;
          // An export starting outside this dialog invalidates it outright —
          // AD-15 allows only one live export while the DEM protocol is
          // global, so the config UI this promise would otherwise populate
          // must not stay up. The cityData/loadingState effects above already
          // close the dialog for their own triggers; this is the equivalent
          // for `isExportingProp`, which has none.
          if (isExportingPropRef.current) {
            setIsExportDialogOpen(false);
            setExportPreview(null);
            return;
          }
          const currentState = useVellumStore.getState();
          if (
            currentState.cityData !== cityData ||
            currentState.loadingState === 'loading'
          ) {
            return;
          }
          // A capture that could not be produced keeps whatever the dialog is
          // already showing: blanking it would tell the user their map is
          // gone, when all that failed is a render of it. On open there is
          // nothing to keep, and `ExportPreview` already says so.
          if (preview === null) return;
          setExportPreview(preview);
        })
        .finally(() => {
          // Only the newest request may lower the flag: a superseded capture
          // resolving late would otherwise clear the indicator while the one
          // the user is waiting for is still rendering.
          if (previewRequestIdRef.current === requestId) {
            previewCapturePendingRef.current = false;
            setIsPreviewCapturing(false);
          }
        });
    },
    [cityData, loadingState, previewCaptureRef],
  );

  const handleOpenExport = useCallback((): void => {
    if (
      cityData === null ||
      loadingState === 'loading' ||
      isExportingRef.current ||
      previewCapturePendingRef.current
    ) {
      return;
    }
    // The dialog opens immediately with no preview and asks for one itself,
    // through `handleRecapturePreview`, as soon as it has settled the
    // composition it opens with. Capturing from here instead would mean
    // guessing that composition — the dialog owns `area`/`background`, and a
    // guess is exactly how the preview and the file drift apart.
    // `OutputDimensions` already renders nothing until `preview` arrives, so a
    // slow capture delays the dimensions readout, never the dialog itself.
    setExportPreview(null);
    setIsExportDialogOpen(true);
  }, [cityData, loadingState]);

  /**
   * Captures the preview for the composition the dialog now describes.
   *
   * @remarks
   * Called by `ExportDialog` when it opens, and afterwards when — and only
   * when — the area or the background actually changes. Everything else the
   * dialog can change (density, filename, presentation toggles) leaves the
   * captured image identical, so re-rendering for those would cost a WebGL
   * surface per click.
   */
  const handleRecapturePreview = useCallback(
    (options: ExportPreviewOptions): void => {
      if (!isExportDialogOpen) return;
      runPreviewCapture(options);
    },
    [isExportDialogOpen, runPreviewCapture],
  );

  const handleExport = useCallback(
    async (options: ExportDialogOptions): Promise<void> => {
      if (isExportingRef.current) return;
      const isSvg = options.format === 'svg';
      // Choosing a route the composition root never wired is a capability
      // problem, not a silent no-op: SVG goes back to unavailable with an
      // actionable message instead of leaving the dialog in limbo.
      if (isSvg && (!svgExporter || !svgSnapshotCaptureRef)) {
        // Clear the previous outcome first: bailing out while a prior success
        // toast is still mounted would show "exported" and "unavailable" at
        // the same time.
        setExportResult(null);
        setExportCancelled(false);
        setExportProgress(null);
        setExportError({
          type: 'ExportFailed',
          reason: SVG_UNSUPPORTED_AREA_REASON,
        });
        return;
      }
      if (!isSvg && !rasterExporter) return;

      const request = buildExportRequest(options);
      setExportError(null);
      setExportCancelled(false);
      setExportResult(null);
      setExportProgress(null);
      // Every presentation option now reaches both routes, so an export starts
      // with no pre-announced omission.
      setExportWarnings([]);
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
      // Raised here, not left to `setExportPhase` — this is the point of no
      // return, and React only re-renders after this tick. A second click
      // dispatched before that render must see the guard already closed.
      isExportingRef.current = true;
      // The real export owns the disposable surface from here on; a preview
      // render still in flight must not land on the dialog it is replacing.
      previewRequestIdRef.current += 1;
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
        // Each route captures and validates its own snapshot shape, so the
        // two are never conflated and neither exporter can be handed the
        // other's snapshot.
        const run = isSvg
          ? prepareSvgExport(request as SvgExportRequest, {
              capture: svgSnapshotCaptureRef?.current ?? null,
              exporter: svgExporter!,
            })
          : prepareRasterExport(request as ExportRequest, {
              capture: snapshotCaptureRef.current,
              exporter: rasterExporter!,
            });

        exportOperationRef.current = { snapshotId: run.snapshotId };
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
        const receipt = await run.start(controller.signal, onProgress);
        if (exportOperationRef.current?.snapshotId !== run.snapshotId) {
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
          if (
            !(error instanceof Error) ||
            !SILENT_CAPABILITY_REASONS.has(error.message)
          ) {
            console.error(
              isSvg ? '[App] SVG export failed:' : '[App] PNG export failed:',
              error,
            );
          }
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
      svgExporter,
      svgSnapshotCaptureRef,
      exportCancelHandlerRef,
      handleCancelExport,
      snapshotCaptureRef,
    ],
  );

  return {
    isExporting,
    isPreviewCapturing,
    isExportDialogOpen,
    setIsExportDialogOpen,
    exportPreview,
    exportPhase,
    exportProgress,
    exportResult,
    exportCancelled,
    exportError,
    exportWarnings,
    handleCancelExport,
    handleOpenExport,
    handleRecapturePreview,
    handleExport,
  };
}
