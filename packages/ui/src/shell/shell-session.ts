import type { LayerName } from '@vellum/core';
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
    activeModal: null,
    pinnedEntity: null,
    restoreFocus: null,
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
      if (narrow && !state.sidebar.collapsed) {
        return {
          ...state,
          sidebar: {
            ...state.sidebar,
            collapsed: true,
            autoCollapsed: true,
            view: { kind: 'overview' },
          },
        };
      }
      if (!narrow && state.sidebar.collapsed && state.sidebar.autoCollapsed) {
        return {
          ...state,
          sidebar: { ...state.sidebar, collapsed: false, autoCollapsed: false },
        };
      }
      return state;
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
      if (state.sidebar.view.kind === 'detail') {
        return {
          ...state,
          sidebar: { ...state.sidebar, view: { kind: 'overview' } },
        };
      }
      if (state.cleanView) return { ...state, cleanView: false };
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
