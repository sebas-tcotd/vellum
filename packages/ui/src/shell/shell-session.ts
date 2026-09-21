import type { LayerName, TransitMode } from '@vellum/core';
import { useReducer } from 'react';

/**
 * Which body the appearance sidebar is showing. Exactly one layer detail can
 * be open at a time (AD-4); `overview` is the resting state.
 */
export type SidebarView =
  | { kind: 'overview' }
  | { kind: 'detail'; layerId: LayerName };

/** Blocking surfaces. Only one may be active at a time (AD-7). */
export type ActiveModal =
  | 'export'
  | 'preferences'
  | 'about'
  | 'partialParse'
  | null;

/** Which surface the viewport shows. `geographic` (MapLibre) is the default. */
export type ViewMode = 'geographic' | 'schematic';

/**
 * Which geometry the schematic diagram is drawn with (Story 4.3).
 *
 * @remarks
 * `geographic` — the normalised real trace — is the default and the only one
 * that invents nothing; the other two are the layouts Story 4.3 measures. One
 * is drawn at a time, never two at once. Ephemeral like the rest of
 * `schematic`: a new city goes back to `geographic`.
 */
export type SchematicLayoutId = 'geographic' | 'octilinear' | 'orthoradial';

/** Layout ids in the order the selector offers them. */
export const SCHEMATIC_LAYOUT_IDS = [
  'geographic',
  'octilinear',
  'orthoradial',
] as const satisfies readonly SchematicLayoutId[];

/**
 * Layouts that have not earned production quality yet (Story 4.3 gates). The
 * selector marks them so choosing one is an informed decision, and the default
 * never silently becomes one of them.
 */
export const EXPERIMENTAL_SCHEMATIC_LAYOUTS: readonly SchematicLayoutId[] = [
  'octilinear',
  'orthoradial',
];

/**
 * Sidebar width model from EXPERIENCE.md: 272 preferred, 240 min, 320 max,
 * 56 px compact rail. Resizing is only offered at >= 1280 px.
 */
export const SIDEBAR_WIDTH = {
  preferred: 272,
  min: 240,
  max: 320,
  rail: 56,
} as const;

/** Below this window width the sidebar cannot be resized and defaults compact. */
export const SIDEBAR_RESIZE_MIN_WINDOW = 1280;

/**
 * Ephemeral desktop-shell session (AD-10). Everything here is lost on reload
 * by design — cartographic state lives in `useVellumStore` and never here.
 */
export interface ShellSessionState {
  sidebar: {
    width: number;
    collapsed: boolean;
    /**
     * Whether the current collapse was the window getting narrow rather than a
     * deliberate choice. Only an automatic collapse is automatically undone —
     * a sidebar the user closed stays closed when the window grows again.
     */
    autoCollapsed: boolean;
    view: SidebarView;
  };
  cleanView: boolean;
  /**
   * The schematic surface's own, ephemeral context (Story 4.2). It is kept
   * apart from `sidebar` on purpose: the two views answer different questions,
   * so neither the width the user gave one nor the body the other was showing
   * may leak across. Reset when the city changes, never persisted.
   */
  schematic: {
    /** Width of the schematic sidebar. Independent of the geographic one. */
    width: number;
    /**
     * Width to restore when the window is wide enough again, or `null` when
     * the current width was not imposed by a narrow window. This is the
     * schematic's counterpart to `sidebar.autoCollapsed`: only a width the
     * window took away is automatically handed back.
     */
    widthBeforeNarrow: number | null;
    /**
     * Modes switched off by the user. `'Unknown'` never appears here — it has
     * no label and no control, so hiding it would be unrecoverable.
     */
    hiddenModes: readonly TransitMode[];
    /**
     * Geometry the diagram is drawn with. Semantic state, not cartographic:
     * switching it redraws the diagram and touches nothing the geographic map
     * is subscribed to, so the camera it was last framed with survives.
     */
    layoutId: SchematicLayoutId;
  };
  /**
   * Geographic map or the independent schematic surface (Epic 4). Ephemeral:
   * never persisted, and reset to `geographic` whenever a new city loads.
   */
  viewMode: ViewMode;
  activeModal: ActiveModal;
  /**
   * Pinned map entity. Always `null` until a keyboard-navigable selection
   * primitive exists in the renderer — see AD-12; the slot is kept so the
   * escape ladder and card invalidation are already wired for it.
   */
  pinnedEntity: null;
  /**
   * `data-focus-id` of the control that opened the current transient state.
   * Restoring focus by id (rather than by holding an element reference) keeps
   * the reducer pure and survives the invoker unmounting and remounting.
   */
  restoreFocus: string | null;
}

export type ShellSessionAction =
  | { type: 'sidebar/openDetail'; layerId: LayerName; invoker?: string }
  | { type: 'sidebar/toggleDetail'; layerId: LayerName; invoker?: string }
  | { type: 'sidebar/closeDetail' }
  | { type: 'sidebar/setCollapsed'; collapsed: boolean }
  | { type: 'sidebar/toggleCollapsed' }
  | { type: 'sidebar/viewportResized'; width: number }
  | { type: 'sidebar/setWidth'; width: number }
  | { type: 'cleanView/toggle'; invoker?: string }
  | { type: 'cleanView/exit' }
  | { type: 'viewMode/toggle' }
  | { type: 'viewMode/reset' }
  | { type: 'schematic/toggleMode'; mode: TransitMode }
  | { type: 'schematic/showAllModes' }
  | { type: 'schematic/setWidth'; width: number }
  | { type: 'schematic/setLayout'; layoutId: SchematicLayoutId }
  | { type: 'schematic/reset'; windowWidth: number }
  | { type: 'modal/open'; modal: NonNullable<ActiveModal>; invoker?: string }
  | { type: 'modal/close' }
  | { type: 'focus/consume' }
  | { type: 'escape' };

/** Default session for a given window width (EXPERIENCE.md "Responsive & Platform"). */
export function initialShellSession(windowWidth: number): ShellSessionState {
  const compact = windowWidth < SIDEBAR_RESIZE_MIN_WINDOW;
  return {
    sidebar: {
      width: compact ? SIDEBAR_WIDTH.min : SIDEBAR_WIDTH.preferred,
      collapsed: compact,
      autoCollapsed: compact,
      view: { kind: 'overview' },
    },
    cleanView: false,
    schematic: initialSchematic(windowWidth),
    viewMode: 'geographic',
    activeModal: null,
    pinnedEntity: null,
    restoreFocus: null,
  };
}

/** The schematic sidebar stays expanded, so it only has a width to choose. */
function initialSchematic(windowWidth: number): ShellSessionState['schematic'] {
  return {
    width:
      windowWidth < SIDEBAR_RESIZE_MIN_WINDOW
        ? SIDEBAR_WIDTH.min
        : SIDEBAR_WIDTH.preferred,
    hiddenModes: [],
    widthBeforeNarrow: null,
    layoutId: 'geographic',
  };
}

const clampWidth = (width: number): number =>
  Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width));

export function shellSessionReducer(
  state: ShellSessionState,
  action: ShellSessionAction,
): ShellSessionState {
  switch (action.type) {
    case 'sidebar/openDetail':
      return {
        ...state,
        sidebar: {
          ...state.sidebar,
          view: { kind: 'detail', layerId: action.layerId },
        },
        restoreFocus: action.invoker ?? null,
      };

    case 'sidebar/toggleDetail': {
      const open =
        state.sidebar.view.kind === 'detail' &&
        state.sidebar.view.layerId === action.layerId;
      return shellSessionReducer(
        state,
        open
          ? { type: 'sidebar/closeDetail' }
          : {
              type: 'sidebar/openDetail',
              layerId: action.layerId,
              ...(action.invoker !== undefined
                ? { invoker: action.invoker }
                : {}),
            },
      );
    }

    case 'sidebar/closeDetail':
      if (state.sidebar.view.kind === 'overview') return state;
      return {
        ...state,
        sidebar: { ...state.sidebar, view: { kind: 'overview' } },
      };

    case 'sidebar/setCollapsed':
      // Collapsing drops the detail context: the rail only carries visibility
      // switches, so a detail body would have nowhere to render. Asking for it
      // explicitly also clears the automatic flag — from here on the window
      // getting wider must not undo the user's own decision.
      return {
        ...state,
        sidebar: {
          ...state.sidebar,
          collapsed: action.collapsed,
          autoCollapsed: false,
          view: action.collapsed ? { kind: 'overview' } : state.sidebar.view,
        },
      };

    case 'sidebar/toggleCollapsed':
      return shellSessionReducer(state, {
        type: 'sidebar/setCollapsed',
        collapsed: !state.sidebar.collapsed,
      });

    case 'sidebar/viewportResized': {
      // The platform convention is to give the sidebar back when there is room
      // for it again, and to get out of the way when there is not.
      const narrow = action.width < SIDEBAR_RESIZE_MIN_WINDOW;
      // A narrow window caps the schematic sidebar rather than collapsing it:
      // it stays expanded by design, and 240 px still leaves room to draw at
      // the 900 px minimum. The cap is remembered so the same convention the
      // geographic side honours through `autoCollapsed` applies here too —
      // room taken away is given back, but a width the user chose while narrow
      // is their decision and survives the window growing again.
      const schematic: ShellSessionState['schematic'] = narrow
        ? state.schematic.width > SIDEBAR_WIDTH.min
          ? {
              ...state.schematic,
              width: SIDEBAR_WIDTH.min,
              widthBeforeNarrow: state.schematic.width,
            }
          : state.schematic
        : state.schematic.widthBeforeNarrow !== null
          ? {
              ...state.schematic,
              width: state.schematic.widthBeforeNarrow,
              widthBeforeNarrow: null,
            }
          : state.schematic;
      const showingGeographic = state.viewMode === 'geographic';
      if (narrow && !state.sidebar.collapsed) {
        return {
          ...state,
          schematic,
          sidebar: {
            ...state.sidebar,
            collapsed: true,
            autoCollapsed: true,
            // Resizing is not a decision about the geographic body. While the
            // schematic owns the screen that body is only hidden, so dropping
            // an open layer detail here would silently lose context the user
            // expects to find again on the way back.
            view: showingGeographic ? { kind: 'overview' } : state.sidebar.view,
          },
        };
      }
      if (!narrow && state.sidebar.collapsed && state.sidebar.autoCollapsed) {
        return {
          ...state,
          schematic,
          sidebar: { ...state.sidebar, collapsed: false, autoCollapsed: false },
        };
      }
      return schematic === state.schematic ? state : { ...state, schematic };
    }

    case 'sidebar/setWidth':
      return {
        ...state,
        sidebar: { ...state.sidebar, width: clampWidth(action.width) },
      };

    case 'cleanView/toggle':
      // AD-7: a blocking surface owns the screen; Clean view cannot start under it.
      if (state.activeModal !== null) return state;
      return {
        ...state,
        cleanView: !state.cleanView,
        restoreFocus: state.cleanView
          ? state.restoreFocus
          : (action.invoker ?? null),
      };

    case 'cleanView/exit':
      return state.cleanView ? { ...state, cleanView: false } : state;

    case 'viewMode/toggle':
      // Like Clean view, the view cannot switch under a blocking surface.
      if (state.activeModal !== null) return state;
      return {
        ...state,
        viewMode: state.viewMode === 'schematic' ? 'geographic' : 'schematic',
      };

    case 'viewMode/reset':
      return state.viewMode === 'geographic'
        ? state
        : { ...state, viewMode: 'geographic' };

    case 'schematic/toggleMode': {
      // `Unknown` is not offered as a control anywhere; refusing it here means
      // no surface can hide it by accident.
      if (action.mode === 'Unknown') return state;
      const hidden = state.schematic.hiddenModes;
      const next = hidden.includes(action.mode)
        ? hidden.filter((mode) => mode !== action.mode)
        : [...hidden, action.mode];
      return { ...state, schematic: { ...state.schematic, hiddenModes: next } };
    }

    case 'schematic/showAllModes':
      return state.schematic.hiddenModes.length === 0
        ? state
        : { ...state, schematic: { ...state.schematic, hiddenModes: [] } };

    case 'schematic/setWidth':
      // Choosing a width explicitly also clears the pending restore, exactly
      // as `sidebar/setCollapsed` clears `autoCollapsed`.
      return {
        ...state,
        schematic: {
          ...state.schematic,
          width: clampWidth(action.width),
          widthBeforeNarrow: null,
        },
      };

    case 'schematic/setLayout':
      // Identity early-return: re-picking the layout already on screen must not
      // produce a new state object, or every consumer memoised on the session
      // would recompute for a diagram that did not change.
      return state.schematic.layoutId === action.layoutId
        ? state
        : {
            ...state,
            schematic: { ...state.schematic, layoutId: action.layoutId },
          };

    case 'schematic/reset':
      // A new city resets the whole schematic context, not just the filters:
      // its width is as ephemeral as its selection, and the window it is
      // reset for is the one currently on screen.
      return {
        ...state,
        schematic: initialSchematic(action.windowWidth),
      };

    case 'modal/open':
      return {
        ...state,
        activeModal: action.modal,
        restoreFocus: action.invoker ?? null,
      };

    case 'modal/close':
      return state.activeModal === null
        ? state
        : { ...state, activeModal: null };

    case 'focus/consume':
      return state.restoreFocus === null
        ? state
        : { ...state, restoreFocus: null };

    case 'escape':
      // The single Escape ladder (AD-7). Dialogs consume Escape themselves via
      // their own focus trap, so this only runs with no modal open; the order
      // below is pinned entity, then layer detail, then Clean view.
      if (state.activeModal !== null) return state;
      if (state.pinnedEntity !== null) return { ...state, pinnedEntity: null };
      // Only the body actually on screen answers Escape. A layer detail left
      // open behind the schematic is hidden, not offered, so it is not what
      // the key is aimed at.
      if (
        state.viewMode === 'geographic' &&
        state.sidebar.view.kind === 'detail'
      ) {
        return {
          ...state,
          sidebar: { ...state.sidebar, view: { kind: 'overview' } },
        };
      }
      if (state.cleanView) return { ...state, cleanView: false };
      if (state.viewMode === 'schematic') {
        return { ...state, viewMode: 'geographic' };
      }
      return state;

    default:
      return state;
  }
}

export interface ShellSession {
  state: ShellSessionState;
  dispatch: React.Dispatch<ShellSessionAction>;
}

/** Owns the ephemeral shell session at the common shell ancestor (AD-10). */
export function useShellSession(windowWidth: number): ShellSession {
  const [state, dispatch] = useReducer(
    shellSessionReducer,
    windowWidth,
    initialShellSession,
  );
  return { state, dispatch };
}
