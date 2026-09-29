import type { LayerName } from '@vellum/core';

/**
 * The one keymap of the webview. The keyboard handler matches against it, the
 * shortcuts sheet lists it, and a test checks it against the accelerators the
 * native menu declares in `menu.rs`, so the three cannot drift apart.
 */

/** Layer order matching the sidebar's visual order (not z-index order). */
export const LAYER_SHORTCUT_ORDER: readonly LayerName[] = [
  'terrain',
  'basemap',
  'roads',
  'transit',
  'buildings',
  'forests',
  'districts',
];

/** Callback slots, named after the `useKeyboardShortcuts` options that fill them. */
export type ShortcutHandler =
  | 'onOpenFile'
  | 'onOpenPreferences'
  | 'onOpenExport'
  | 'onFitToScreen'
  | 'onZoomIn'
  | 'onZoomOut'
  | 'onPreciseZoom'
  | 'onHidePanel'
  | 'onToggleSidebar'
  | 'onToggleNavigationMode'
  | 'onToggleIconLegend'
  | 'onRotateBy'
  | 'onPanBy'
  | 'onResetBearing'
  | 'onToggleLayer'
  | 'onOpenAdvancedOptions'
  | 'onEscape'
  | 'onShowShortcuts';

/** Argument a shortcut passes to its handler: rotation delta, layer, or pan offset. */
export type ShortcutPayload = number | LayerName | readonly [number, number];

export type ShortcutGroup = 'file' | 'map' | 'layers' | 'view';

export interface Shortcut {
  /** Stable id; also the i18n key suffix of its label in the sheet. */
  id: string;
  handler: ShortcutHandler;
  /** Argument passed to the handler (rotation delta or layer). */
  payload?: ShortcutPayload;
  group: ShortcutGroup;
  /** Required modifiers. Any modifier not listed blocks the match. */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Matches whether Shift is held or not (`+` needs Shift on many layouts). */
  anyShift?: boolean;
  /** Matches with or without Ctrl/Cmd; the sheet shows the Ctrl/Cmd form. */
  anyMod?: boolean;
  /** `KeyboardEvent.key` values, lower-case. Layout-aware, so preferred. */
  keys?: readonly string[];
  /**
   * `KeyboardEvent.code` values, for keys a modifier rewrites: Option turns
   * Z into "Ω" on macOS, and Shift turns 1 into "!" on the main row.
   */
  codes?: readonly string[];
  /** Key cap shown in the sheet, without modifiers. */
  cap: string;
  /**
   * Swallowed even when no handler is wired, because the webview would
   * otherwise act on it (Ctrl+0/+/- zoom the page itself).
   */
  reserved?: boolean;
  /** Tauri accelerator of the native menu item for the same action, if any. */
  accelerator?: string;
}

/** Arrow-key pan distance in CSS pixels, MapLibre's own default step. */
const PAN_STEP = 100;

const digit = (n: number) => ({
  keys: [String(n)],
  codes: [`Digit${n}`, `Numpad${n}`],
});

// Only the layers whose native Layers submenu has "Open in Sidebar…".
const MENU_DETAIL_LAYERS: ReadonlySet<LayerName> = new Set([
  'terrain',
  'basemap',
  'transit',
  'buildings',
  'districts',
]);

const layerShortcuts: Shortcut[] = LAYER_SHORTCUT_ORDER.flatMap((layer, i) => {
  const n = i + 1;
  return [
    {
      id: `layer.toggle.${layer}`,
      handler: 'onToggleLayer',
      payload: layer,
      group: 'layers',
      ...digit(n),
      cap: String(n),
      accelerator: `Digit${n}`,
    },
    {
      id: `layer.detail.${layer}`,
      handler: 'onOpenAdvancedOptions',
      payload: layer,
      group: 'layers',
      shift: true,
      ...digit(n),
      cap: String(n),
      ...(MENU_DETAIL_LAYERS.has(layer)
        ? { accelerator: `Shift+Digit${n}` }
        : {}),
    },
  ] satisfies Shortcut[];
});

export const SHORTCUTS: readonly Shortcut[] = [
  // Handled before anything else by the shell's Escape ladder (AD-7); Shift
  // does not change what Escape means.
  {
    id: 'escape',
    handler: 'onEscape',
    group: 'view',
    anyShift: true,
    keys: ['escape'],
    cap: 'Esc',
  },
  {
    id: 'openFile',
    handler: 'onOpenFile',
    group: 'file',
    mod: true,
    keys: ['o'],
    cap: 'O',
    accelerator: 'CmdOrCtrl+O',
  },
  {
    id: 'export',
    handler: 'onOpenExport',
    group: 'file',
    mod: true,
    keys: ['e'],
    cap: 'E',
    accelerator: 'CmdOrCtrl+E',
  },
  // The native accelerator is not consistently delivered by WebView2 on
  // Windows, so the webview keeps its own route for Ctrl+,.
  {
    id: 'preferences',
    handler: 'onOpenPreferences',
    group: 'file',
    mod: true,
    keys: [','],
    codes: ['Comma'],
    cap: ',',
    accelerator: 'CmdOrCtrl+Comma',
  },
  {
    id: 'fitCity',
    handler: 'onFitToScreen',
    group: 'map',
    mod: true,
    keys: ['0', '9'],
    cap: '0',
    reserved: true,
    accelerator: 'CmdOrCtrl+Digit0',
  },
  {
    id: 'zoomIn',
    handler: 'onZoomIn',
    group: 'map',
    mod: true,
    // The bare key too, as MapLibre's own keyboard handler used to offer.
    anyMod: true,
    anyShift: true,
    keys: ['+', '='],
    cap: '+',
    reserved: true,
    accelerator: 'CmdOrCtrl+Equal',
  },
  {
    id: 'zoomOut',
    handler: 'onZoomOut',
    group: 'map',
    mod: true,
    anyMod: true,
    keys: ['-'],
    cap: '−',
    reserved: true,
    accelerator: 'CmdOrCtrl+Minus',
  },
  {
    id: 'preciseZoom',
    handler: 'onPreciseZoom',
    group: 'map',
    mod: true,
    alt: true,
    codes: ['KeyZ'],
    cap: 'Z',
    accelerator: 'CmdOrCtrl+Alt+KeyZ',
  },
  ...(
    [
      ['panLeft', 'arrowleft', '←', [-PAN_STEP, 0]],
      ['panRight', 'arrowright', '→', [PAN_STEP, 0]],
      ['panUp', 'arrowup', '↑', [0, -PAN_STEP]],
      ['panDown', 'arrowdown', '↓', [0, PAN_STEP]],
    ] as const
  ).map(
    ([id, key, cap, offset]): Shortcut => ({
      id,
      handler: 'onPanBy',
      payload: offset,
      group: 'map',
      keys: [key],
      cap,
    }),
  ),
  {
    id: 'rotateLeft',
    handler: 'onRotateBy',
    payload: -15,
    group: 'map',
    shift: true,
    keys: ['arrowleft'],
    cap: '←',
    reserved: true,
    accelerator: 'Shift+ArrowLeft',
  },
  {
    id: 'rotateRight',
    handler: 'onRotateBy',
    payload: 15,
    group: 'map',
    shift: true,
    keys: ['arrowright'],
    cap: '→',
    reserved: true,
    accelerator: 'Shift+ArrowRight',
  },
  {
    id: 'resetNorth',
    handler: 'onResetBearing',
    group: 'map',
    keys: ['r'],
    cap: 'R',
    accelerator: 'KeyR',
  },
  {
    id: 'mapBounds',
    handler: 'onToggleNavigationMode',
    group: 'map',
    mod: true,
    keys: ['b'],
    cap: 'B',
    accelerator: 'CmdOrCtrl+KeyB',
  },
  ...layerShortcuts,
  {
    id: 'cleanView',
    handler: 'onHidePanel',
    group: 'view',
    keys: ['h'],
    cap: 'H',
    accelerator: 'KeyH',
  },
  {
    id: 'sidebar',
    handler: 'onToggleSidebar',
    group: 'view',
    mod: true,
    alt: true,
    codes: ['KeyS'],
    cap: 'S',
    accelerator: 'CmdOrCtrl+Alt+KeyS',
  },
  {
    id: 'mapSymbols',
    handler: 'onToggleIconLegend',
    group: 'view',
    keys: ['l'],
    cap: 'L',
    accelerator: 'KeyL',
  },
  // `?` sits on a different key per layout (Shift+/ in US, Shift+' in Latin
  // American), so it matches the character, with or without Shift.
  {
    id: 'shortcuts',
    handler: 'onShowShortcuts',
    group: 'view',
    anyShift: true,
    keys: ['?'],
    cap: '?',
  },
];

/** The shortcut a key press triggers, if any. */
export function matchShortcut(e: KeyboardEvent): Shortcut | undefined {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  return SHORTCUTS.find(
    (s) =>
      (s.anyMod || !!s.mod === mod) &&
      !!s.alt === e.altKey &&
      (s.anyShift || !!s.shift === e.shiftKey) &&
      (s.keys?.includes(key) || s.codes?.includes(e.code)),
  );
}
