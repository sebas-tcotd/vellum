import type { LayerName } from '@vellum/core';
import { useMemo } from 'react';

/**
 * Every action that more than one desktop surface can invoke. A command is the
 * only route those surfaces use, so the native menu, a keyboard shortcut and a
 * button in the shell cannot drift apart (AD-3).
 *
 * Actions with a single surface — the per-layer advanced options, which reach
 * the same store setter from the Layers menu and the layer detail panel — stay
 * on their setters; they have no second implementation to diverge from.
 */
export type CommandId =
  | 'document.open'
  | 'document.export'
  | 'view.fitCity'
  | 'view.zoomIn'
  | 'view.zoomOut'
  | 'view.resetNorth'
  | 'view.rotate'
  | 'view.cleanView'
  | 'view.mapSymbols'
  | 'view.mapBounds'
  | 'layer.toggle'
  | 'layer.detail'
  | 'style.set'
  | 'style.transitDimming';

/** Payload accepted by each command. `void` means the command takes none. */
export interface CommandPayloads {
  'document.open': void;
  'document.export': void;
  'view.fitCity': void;
  'view.zoomIn': void;
  'view.zoomOut': void;
  'view.resetNorth': void;
  'view.rotate': number;
  'view.cleanView': void;
  'view.mapSymbols': void;
  'view.mapBounds': void;
  'layer.toggle': LayerName;
  'layer.detail': LayerName;
  'style.set': string;
  'style.transitDimming': void;
}

/** Why a command is currently unavailable — surfaced as a disabled reason. */
export type UnavailableReason = 'no-map' | 'loading' | 'exporting';

export interface Command<Id extends CommandId> {
  id: Id;
  /** Whether invoking the command right now would do anything. */
  canExecute: boolean;
  /** Set when `canExecute` is false, so a surface can explain the disabled state. */
  unavailableReason?: UnavailableReason;
  /**
   * Runs the command.
   *
   * @param payload - The command's payload, if it takes one.
   * @param invoker - `data-focus-id` of the control that triggered it, so a
   * transient state it opens knows where to hand focus back. Menu and shortcut
   * routes leave it undefined, which is what makes them fall back to a
   * heading instead of a control that was never touched.
   */
  execute: (payload: CommandPayloads[Id], invoker?: string) => void;
}

export type CommandRegistry = { [Id in CommandId]: Command<Id> };

/** Application handlers the adapter delegates to. All already exist. */
export interface CommandDeps {
  openFileDialog: () => void | Promise<void>;
  openExport: () => void | Promise<void>;
  fitToScreen: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetBearing: () => void;
  rotateBy: (delta: number) => void;
  toggleIconLegend: () => void;
  toggleNavigationMode: () => void;
  toggleLayer: (layer: LayerName) => void;
  setActiveTheme: (theme: string) => void;
  setTransitDimmingEnabled: (enabled: boolean) => void;
  transitDimmingEnabled: boolean;
  availableThemeIds: readonly string[];
  /** Toggles Clean view. Owned by `ShellSession`, injected so this stays view-free. */
  toggleCleanView: (invoker?: string) => void;
  /** Opens (or closes, if already open) one layer's detail context. */
  toggleLayerDetail: (layer: LayerName, invoker?: string) => void;
  /** Ambient state the availability rules read. */
  hasMap: boolean;
  isLoading: boolean;
  isExporting: boolean;
}

/**
 * Builds the command registry. Availability is computed once here so a menu
 * item, a shortcut and a button never disagree about whether an action applies.
 */
export function useDesktopCommands(deps: CommandDeps): CommandRegistry {
  const {
    openFileDialog,
    openExport,
    fitToScreen,
    zoomIn,
    zoomOut,
    resetBearing,
    rotateBy,
    toggleIconLegend,
    toggleNavigationMode,
    toggleLayer,
    setActiveTheme,
    setTransitDimmingEnabled,
    transitDimmingEnabled,
    availableThemeIds,
    toggleCleanView,
    toggleLayerDetail,
    hasMap,
    isLoading,
    isExporting,
  } = deps;

  return useMemo<CommandRegistry>(() => {
    // Availability mirrors the guards the native menu already applied, so no
    // action becomes more or less reachable than it was before the migration.
    const noMap: UnavailableReason | null = hasMap ? null : 'no-map';

    const make = <Id extends CommandId>(
      id: Id,
      reason: UnavailableReason | null,
      execute: (payload: CommandPayloads[Id], invoker?: string) => void,
    ): Command<Id> => ({
      id,
      canExecute: reason === null,
      ...(reason !== null ? { unavailableReason: reason } : {}),
      // A disabled command is inert from every surface, including the native
      // menu, which cannot always grey its own items in time.
      execute: (payload, invoker) => {
        if (reason !== null) return;
        execute(payload, invoker);
      },
    });

    const mapReason = noMap;
    const cleanViewReason = noMap ?? (isLoading ? 'loading' : null);
    const exportReason =
      noMap ?? (isLoading ? 'loading' : isExporting ? 'exporting' : null);

    return {
      // Open stays available with no map — it is the only way out of that state.
      'document.open': make('document.open', null, () => {
        void openFileDialog();
      }),
      'document.export': make('document.export', exportReason, () => {
        void openExport();
      }),
      'view.fitCity': make('view.fitCity', mapReason, fitToScreen),
      'view.zoomIn': make('view.zoomIn', mapReason, zoomIn),
      'view.zoomOut': make('view.zoomOut', mapReason, zoomOut),
      // Availability is the plain map guard the menu and `R` always had. The
      // camera group hides its button while bearing is 0 — that is a
      // presentation rule ("appears only when rotated"), not availability, so
      // the menu route keeps working exactly as before.
      'view.resetNorth': make('view.resetNorth', mapReason, resetBearing),
      'view.rotate': make('view.rotate', mapReason, (delta) => rotateBy(delta)),
      'view.cleanView': make(
        'view.cleanView',
        cleanViewReason,
        (_payload, invoker) => toggleCleanView(invoker),
      ),
      'view.mapSymbols': make('view.mapSymbols', mapReason, toggleIconLegend),
      'view.mapBounds': make('view.mapBounds', mapReason, toggleNavigationMode),
      'layer.toggle': make('layer.toggle', mapReason, (layer) =>
        toggleLayer(layer),
      ),
      // Opening a layer's detail never changes that layer's visibility (AD-11).
      'layer.detail': make('layer.detail', mapReason, (layer, invoker) =>
        toggleLayerDetail(layer, invoker),
      ),
      // Style choices persist independently of a loaded document, and the
      // Themes menu has always been reachable with no map. Keep it that way.
      'style.set': make('style.set', null, (theme) => {
        if (availableThemeIds.includes(theme)) setActiveTheme(theme);
      }),
      'style.transitDimming': make('style.transitDimming', null, () => {
        setTransitDimmingEnabled(!transitDimmingEnabled);
      }),
    };
  }, [
    availableThemeIds,
    fitToScreen,
    hasMap,
    isExporting,
    isLoading,
    openExport,
    openFileDialog,
    resetBearing,
    rotateBy,
    setActiveTheme,
    setTransitDimmingEnabled,
    toggleCleanView,
    toggleIconLegend,
    toggleLayer,
    toggleLayerDetail,
    toggleNavigationMode,
    transitDimmingEnabled,
    zoomIn,
    zoomOut,
  ]);
}
