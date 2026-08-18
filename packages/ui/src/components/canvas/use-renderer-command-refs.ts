import { useEffect, type RefObject } from 'react';
import type {
  ExportPreviewSnapshot,
  ExportRequest,
  ExportSnapshot,
  SvgExportRequest,
  SvgExportSnapshot,
} from '@vellum/core';
import type {
  MapLibreRenderer,
  ServiceIconLegendState,
} from '@vellum/renderer-webgl';

interface RendererCommandRefs {
  fitToScreenRef?: RefObject<(() => void) | null> | undefined;
  zoomInRef?: RefObject<(() => void) | null> | undefined;
  zoomOutRef?: RefObject<(() => void) | null> | undefined;
  toggleNavigationModeRef?: RefObject<(() => void) | null> | undefined;
  rotateByRef?: RefObject<((delta: number) => void) | null> | undefined;
  resetBearingRef?: RefObject<(() => void) | null> | undefined;
  previewCaptureRef?:
    | RefObject<(() => Promise<ExportPreviewSnapshot | null>) | null>
    | undefined;
  snapshotCaptureRef?:
    | RefObject<((request: ExportRequest) => ExportSnapshot | null) | null>
    | undefined;
  svgSnapshotCaptureRef?:
    | RefObject<
        ((request: SvgExportRequest) => SvgExportSnapshot | null) | null
      >
    | undefined;
  subscribeServiceIconLegendRef?:
    | RefObject<
        | ((callback: (state: ServiceIconLegendState) => void) => () => void)
        | null
      >
    | undefined;
}

/** Registers renderer commands in refs owned by the application composition root. */
export function useRendererCommandRefs(
  rendererRef: RefObject<MapLibreRenderer | null>,
  refs: RendererCommandRefs,
): void {
  const {
    fitToScreenRef,
    zoomInRef,
    zoomOutRef,
    toggleNavigationModeRef,
    rotateByRef,
    resetBearingRef,
    previewCaptureRef,
    snapshotCaptureRef,
    svgSnapshotCaptureRef,
    subscribeServiceIconLegendRef,
  } = refs;

  useEffect(() => {
    if (!fitToScreenRef) return;
    fitToScreenRef.current = () => rendererRef.current?.fitToScreen();
    return () => {
      fitToScreenRef.current = null;
    };
  }, [fitToScreenRef, rendererRef]);

  useEffect(() => {
    if (!zoomInRef) return;
    zoomInRef.current = () => rendererRef.current?.zoomIn();
    return () => {
      zoomInRef.current = null;
    };
  }, [rendererRef, zoomInRef]);

  useEffect(() => {
    if (!zoomOutRef) return;
    zoomOutRef.current = () => rendererRef.current?.zoomOut();
    return () => {
      zoomOutRef.current = null;
    };
  }, [rendererRef, zoomOutRef]);

  useEffect(() => {
    if (!toggleNavigationModeRef) return;
    toggleNavigationModeRef.current = () =>
      rendererRef.current?.toggleNavigationMode();
    return () => {
      toggleNavigationModeRef.current = null;
    };
  }, [rendererRef, toggleNavigationModeRef]);

  useEffect(() => {
    if (!rotateByRef) return;
    rotateByRef.current = (delta: number) =>
      rendererRef.current?.rotateBy(delta);
    return () => {
      rotateByRef.current = null;
    };
  }, [rendererRef, rotateByRef]);

  useEffect(() => {
    if (!resetBearingRef) return;
    resetBearingRef.current = () => rendererRef.current?.resetBearing();
    return () => {
      resetBearingRef.current = null;
    };
  }, [rendererRef, resetBearingRef]);

  useEffect(() => {
    if (!previewCaptureRef) return;
    previewCaptureRef.current = () =>
      rendererRef.current?.capturePreview() ?? Promise.resolve(null);
    return () => {
      previewCaptureRef.current = null;
    };
  }, [previewCaptureRef, rendererRef]);

  useEffect(() => {
    if (!snapshotCaptureRef) return;
    snapshotCaptureRef.current = (request) =>
      rendererRef.current?.createExportSnapshot(request) ?? null;
    return () => {
      snapshotCaptureRef.current = null;
    };
  }, [rendererRef, snapshotCaptureRef]);

  useEffect(() => {
    if (!svgSnapshotCaptureRef) return;
    svgSnapshotCaptureRef.current = (request) =>
      rendererRef.current?.createSvgExportSnapshot(request) ?? null;
    return () => {
      svgSnapshotCaptureRef.current = null;
    };
  }, [rendererRef, svgSnapshotCaptureRef]);

  useEffect(() => {
    if (!subscribeServiceIconLegendRef) return;
    subscribeServiceIconLegendRef.current = (callback) =>
      rendererRef.current?.subscribeServiceIconLegend(callback) ?? (() => {});
    return () => {
      subscribeServiceIconLegendRef.current = null;
    };
  }, [rendererRef, subscribeServiceIconLegendRef]);
}
