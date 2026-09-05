import { LAYERS_WITH_ADVANCED_OPTIONS } from '@vellum/core';
import type { LayerName } from '@vellum/core';
import { useEffect } from 'react';

/** Layer order matching the FloatingLayerPanel visual order (not z-index order). */
const LAYER_SHORTCUT_MAP: LayerName[] = [
  'terrain',
  'basemap',
  'roads',
  'transit',
  'buildings',
  'forests',
  'districts',
];

interface UseKeyboardShortcutsOptions {
  onOpenFile: () => void;
  /** Called when the user presses Ctrl/Cmd + E to open export configuration. */
  onOpenExport?: () => void;
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
  /** Called when the user presses Ctrl/Cmd + B to toggle navigation mode. */
  onToggleNavigationMode?: () => void;
  /** Called when the user presses L (no modifiers) to toggle the IconLegend. */
  onToggleIconLegend?: () => void;
  /** Called when the user presses Shift + Left/Right arrow to rotate the map. */
  onRotateBy?: (deltaDegrees: number) => void;
  /** Called when the user presses R (no modifiers) to reset the map bearing to north. */
  onResetBearing?: () => void;
  /** Called when the user presses Shift+1..7 to open a layer's advanced options panel. */
  onOpenAdvancedOptions?: (layer: LayerName) => void;
  /**
   * Called on Escape so the shell can resolve the topmost transient state.
   *
   * @remarks
   * The single Escape route for the shell (AD-7). Dialogs trap and consume
   * Escape themselves, so the composition root only supplies this while no
   * blocking surface is open — there are no competing global listeners.
   */
  onEscape?: () => void;
  /**
   * When false, the shortcut handler does nothing without removing the listener.
   * @default true
   */
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onOpenFile,
  onOpenExport,
  onToggleLayer,
  onFitToScreen,
  onZoomIn,
  onZoomOut,
  onHidePanel,
  onToggleNavigationMode,
  onToggleIconLegend,
  onRotateBy,
  onResetBearing,
  onOpenAdvancedOptions,
  onEscape,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!enabled) return;
      if (isEditableTarget(e.target)) return;
      const isModKey = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape' && !isModKey && !e.altKey) {
        if (onEscape) {
          e.preventDefault();
          onEscape();
        }
        return;
      }

      if (isModKey && !e.shiftKey && !e.altKey && e.key === 'o') {
        e.preventDefault();
        onOpenFile();
        return;
      }

      if (isModKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
        if (onOpenExport) {
          e.preventDefault();
          onOpenExport();
        }
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

      // Rotate counter-clockwise: Shift + Left Arrow
      if (e.shiftKey && !isModKey && !e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        onRotateBy?.(-15);
        return;
      }

      // Rotate clockwise: Shift + Right Arrow
      if (e.shiftKey && !isModKey && !e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        onRotateBy?.(15);
        return;
      }

      // Reset bearing to north: R without any modifiers
      if (
        !isModKey &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'r'
      ) {
        if (onResetBearing) {
          e.preventDefault();
          onResetBearing();
        }
        return;
      }

      // Toggle navigation mode: Ctrl/Cmd + B
      if (isModKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        if (onToggleNavigationMode) {
          e.preventDefault();
          onToggleNavigationMode();
        }
        return;
      }

      // Toggle IconLegend: L without any modifiers
      if (
        !isModKey &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'l'
      ) {
        if (onToggleIconLegend) {
          e.preventDefault();
          onToggleIconLegend();
        }
        return;
      }

      // Shift+1..7 to open advanced options panel for layers that have them
      if (!isModKey && e.shiftKey && !e.altKey) {
        const layerIdx = parseInt(e.key, 10) - 1;
        if (layerIdx >= 0 && layerIdx < LAYER_SHORTCUT_MAP.length) {
          const layer = LAYER_SHORTCUT_MAP[layerIdx];
          if (layer) {
            e.preventDefault();
            if (LAYERS_WITH_ADVANCED_OPTIONS.has(layer)) {
              onOpenAdvancedOptions?.(layer);
            }
            return;
          }
        }
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
    onOpenExport,
    onToggleLayer,
    onFitToScreen,
    onZoomIn,
    onZoomOut,
    onHidePanel,
    onToggleNavigationMode,
    onToggleIconLegend,
    onRotateBy,
    onResetBearing,
    onOpenAdvancedOptions,
    onEscape,
    enabled,
  ]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.matches('input, textarea, select')) return true;
  if (target.isContentEditable || target.contentEditable === 'true')
    return true;
  return (
    target.closest('[contenteditable=""], [contenteditable="true"]') != null
  );
}
