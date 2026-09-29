import { hasAdvancedOptions } from '@vellum/core';
import type { LayerName } from '@vellum/core';
import { useEffect, useRef } from 'react';
import { useVellumStore } from '../store/vellum-store';
import { matchShortcut, type ShortcutPayload } from '../shell/shortcuts';

export interface UseKeyboardShortcutsOptions {
  onOpenFile: () => void;
  /** Called when the user presses Ctrl/Cmd + , to open preferences. */
  onOpenPreferences?: () => void;
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
  /** Called when the user presses Ctrl/Cmd + Alt/Option + Z to toggle precise zoom. */
  onPreciseZoom?: () => void;
  /** Called when the user presses H (no modifiers) to toggle clean mode. */
  onHidePanel?: () => void;
  /** Called when the user presses Ctrl/Cmd + Alt/Option + S to toggle the sidebar. */
  onToggleSidebar?: () => void;
  /** Called when the user presses Ctrl/Cmd + B to toggle navigation mode. */
  onToggleNavigationMode?: () => void;
  /** Called when the user presses L (no modifiers) to toggle the IconLegend. */
  onToggleIconLegend?: () => void;
  /** Called when the user presses Shift + Left/Right arrow to rotate the map. */
  onRotateBy?: (deltaDegrees: number) => void;
  /** Called when the user presses an arrow key (no modifiers) to pan the map, with `[dx, dy]` in CSS pixels. */
  onPanBy?: (offset: readonly [number, number]) => void;
  /** Called when the user presses R (no modifiers) to reset the map bearing to north. */
  onResetBearing?: () => void;
  /** Called when the user presses `?` to open or close the shortcuts sheet. */
  onShowShortcuts?: () => void;
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

/**
 * Dispatches the webview keymap (`SHORTCUTS`) to the given callbacks.
 *
 * @remarks
 * The table decides which key means what; this hook only adds the runtime
 * rules: nothing fires while typing in a field or while `enabled` is false,
 * and a layer's detail opens only when that layer has options for the loaded
 * city (the key is still swallowed so it does nothing else).
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  // Latest callbacks without re-registering the listener on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const current = optionsRef.current;
      if (current.enabled === false) return;
      if (isEditableTarget(e.target)) return;

      const shortcut = matchShortcut(e);
      if (!shortcut) return;
      const callback = current[shortcut.handler] as
        | ((payload?: ShortcutPayload) => void)
        | undefined;

      if (shortcut.handler === 'onOpenAdvancedOptions') {
        e.preventDefault();
        const layer = shortcut.payload as LayerName;
        if (
          hasAdvancedOptions(layer, useVellumStore.getState().cityData?.source)
        ) {
          callback?.(layer);
        }
        return;
      }

      if (callback || shortcut.reserved) e.preventDefault();
      if (shortcut.payload === undefined) callback?.();
      else callback?.(shortcut.payload);
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
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
