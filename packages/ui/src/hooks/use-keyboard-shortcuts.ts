import { useEffect } from 'react';
import type { LayerName } from '@vellum/core';

/** Layer order matching the FloatingLayerPanel visual order (not z-index order). */
const LAYER_SHORTCUT_MAP: LayerName[] = [
  'terrain',
  'water',
  'roads',
  'transit',
  'buildings',
  'forests',
  'districts',
];

interface UseKeyboardShortcutsOptions {
  onOpenFile: () => void;
  /** Called when the user presses keys 1–7 to toggle the corresponding layer. */
  onToggleLayer?: (layer: LayerName) => void;
  /** Called when the user presses Ctrl+0 or Ctrl+9 to reset the viewport to fit-to-screen. */
  onFitToScreen?: () => void;
  /** Called when the user presses Ctrl/Cmd + + or = to zoom in. */
  onZoomIn?: () => void;
  /** Called when the user presses Ctrl/Cmd + - to zoom out. */
  onZoomOut?: () => void;
  /** Called when the user presses H (no modifiers) to toggle clean mode. */
  onHidePanel?: () => void;
  /**
   * When false, the shortcut handler does nothing without removing the listener.
   * @default true
   */
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onOpenFile,
  onToggleLayer,
  onFitToScreen,
  onZoomIn,
  onZoomOut,
  onHidePanel,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!enabled) return;
      const isModKey = e.ctrlKey || e.metaKey;

      if (isModKey && !e.shiftKey && !e.altKey && e.key === 'o') {
        e.preventDefault();
        onOpenFile();
        return;
      }

      if (
        isModKey &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === '0' || e.key === '9')
      ) {
        e.preventDefault();
        onFitToScreen?.();
        return;
      }

      // Zoom in: Ctrl/Cmd + + (also covers Ctrl+= for keyboards without numpad)
      if (isModKey && !e.altKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        onZoomIn?.();
        return;
      }

      // Zoom out: Ctrl/Cmd + - (no shift to avoid conflict)
      if (isModKey && !e.shiftKey && !e.altKey && e.key === '-') {
        e.preventDefault();
        onZoomOut?.();
        return;
      }

      // Clean mode: H without any modifiers
      if (
        !isModKey &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'h'
      ) {
        if (onHidePanel) {
          e.preventDefault();
          onHidePanel();
        }
        return;
      }

      // Layer shortcuts 1–7 — no modifier keys
      if (!isModKey && !e.shiftKey && !e.altKey) {
        const layerIdx = parseInt(e.key, 10) - 1;
        if (layerIdx >= 0 && layerIdx < LAYER_SHORTCUT_MAP.length) {
          const layer = LAYER_SHORTCUT_MAP[layerIdx];
          if (layer) {
            e.preventDefault();
            onToggleLayer?.(layer);
          }
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    onOpenFile,
    onToggleLayer,
    onFitToScreen,
    onZoomIn,
    onZoomOut,
    onHidePanel,
    enabled,
  ]);
}
