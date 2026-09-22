import { describe, expect, it } from 'vitest';
import {
  initialShellSession,
  shellSessionReducer,
  SIDEBAR_WIDTH,
  type ShellSessionState,
} from './shell-session';

const base = (
  overrides: Partial<ShellSessionState> = {},
): ShellSessionState => ({
  ...initialShellSession(1440),
  ...overrides,
});

describe('initialShellSession', () => {
  it('defaults to compact at the supported minimum desktop width', () => {
    const state = initialShellSession(900);
    expect(state.sidebar.collapsed).toBe(true);
    expect(state.sidebar.width).toBe(SIDEBAR_WIDTH.min);
  });

  it('defaults to the preferred width on a standard desktop', () => {
    const state = initialShellSession(1440);
    expect(state.sidebar.collapsed).toBe(false);
    expect(state.sidebar.width).toBe(SIDEBAR_WIDTH.preferred);
  });
});

describe('published schematic layouts', () => {
  it('normalizes Orthoradial when the source city becomes ineligible', () => {
    const selected = shellSessionReducer(base(), {
      type: 'schematic/setLayout',
      layoutId: 'orthoradial',
    });
    expect(selected.schematic.layoutId).toBe('orthoradial');
    expect(
      shellSessionReducer(selected, {
        type: 'schematic/normalizeLayout',
        orthoradialEligible: false,
      }).schematic.layoutId,
    ).toBe('geographic');
  });
});

describe('sidebar context', () => {
  it('keeps exactly one layer detail open', () => {
    let state = shellSessionReducer(base(), {
      type: 'sidebar/openDetail',
      layerId: 'transit',
    });
    state = shellSessionReducer(state, {
      type: 'sidebar/openDetail',
      layerId: 'buildings',
    });
    expect(state.sidebar.view).toEqual({
      kind: 'detail',
      layerId: 'buildings',
    });
  });

  it('toggles the same layer closed and returns to overview', () => {
    let state = shellSessionReducer(base(), {
      type: 'sidebar/toggleDetail',
      layerId: 'terrain',
    });
    expect(state.sidebar.view.kind).toBe('detail');
    state = shellSessionReducer(state, {
      type: 'sidebar/toggleDetail',
      layerId: 'terrain',
    });
    expect(state.sidebar.view.kind).toBe('overview');
  });

  it('records the invoker so Back can restore focus to it', () => {
    const state = shellSessionReducer(base(), {
      type: 'sidebar/openDetail',
      layerId: 'transit',
      invoker: 'disclosure-transit',
    });
    expect(state.restoreFocus).toBe('disclosure-transit');
  });

  it('drops the detail context when collapsing to the rail', () => {
    const open = shellSessionReducer(base(), {
      type: 'sidebar/openDetail',
      layerId: 'districts',
    });
    const collapsed = shellSessionReducer(open, {
      type: 'sidebar/setCollapsed',
      collapsed: true,
    });
    expect(collapsed.sidebar.view.kind).toBe('overview');
  });

  it('clamps a resize to the documented bounds', () => {
    expect(
      shellSessionReducer(base(), { type: 'sidebar/setWidth', width: 900 })
        .sidebar.width,
    ).toBe(SIDEBAR_WIDTH.max);
    expect(
      shellSessionReducer(base(), { type: 'sidebar/setWidth', width: 10 })
        .sidebar.width,
    ).toBe(SIDEBAR_WIDTH.min);
  });
});

describe('automatic collapse on resize', () => {
  it('steps aside when the window becomes too narrow for it', () => {
    const state = shellSessionReducer(base(), {
      type: 'sidebar/viewportResized',
      width: 1000,
    });
    expect(state.sidebar.collapsed).toBe(true);
    expect(state.sidebar.autoCollapsed).toBe(true);
  });

  it('comes back once there is room again', () => {
    const narrow = shellSessionReducer(base(), {
      type: 'sidebar/viewportResized',
      width: 1000,
    });
    const wide = shellSessionReducer(narrow, {
      type: 'sidebar/viewportResized',
      width: 1440,
    });
    expect(wide.sidebar.collapsed).toBe(false);
    expect(wide.sidebar.autoCollapsed).toBe(false);
  });

  it('never reopens a sidebar the user closed on purpose', () => {
    const closedByUser = shellSessionReducer(base(), {
      type: 'sidebar/setCollapsed',
      collapsed: true,
    });
    expect(closedByUser.sidebar.autoCollapsed).toBe(false);

    const wide = shellSessionReducer(closedByUser, {
      type: 'sidebar/viewportResized',
      width: 1920,
    });
    expect(wide.sidebar.collapsed).toBe(true);
  });

  it('drops the layer detail when the window forces the rail', () => {
    const withDetail = shellSessionReducer(base(), {
      type: 'sidebar/openDetail',
      layerId: 'transit',
    });
    const narrow = shellSessionReducer(withDetail, {
      type: 'sidebar/viewportResized',
      width: 1000,
    });
    expect(narrow.sidebar.view.kind).toBe('overview');
  });

  it('is inert while the window stays on one side of the threshold', () => {
    const state = base();
    expect(
      shellSessionReducer(state, {
        type: 'sidebar/viewportResized',
        width: 1600,
      }),
    ).toBe(state);
  });

  it('treats an explicit toggle as the user deciding', () => {
    const narrow = shellSessionReducer(base(), {
      type: 'sidebar/viewportResized',
      width: 1000,
    });
    const reopened = shellSessionReducer(narrow, {
      type: 'sidebar/toggleCollapsed',
    });
    expect(reopened.sidebar.collapsed).toBe(false);
    // Reopened by hand at a narrow width: a later resize must not re-close it
    // on the strength of an automatic flag that no longer applies.
    expect(reopened.sidebar.autoCollapsed).toBe(false);
  });
});

describe('clean view', () => {
  it('cannot be entered while a blocking surface owns the screen', () => {
    const state = shellSessionReducer(base({ activeModal: 'export' }), {
      type: 'cleanView/toggle',
    });
    expect(state.cleanView).toBe(false);
  });

  it('preserves the sidebar context across a round trip', () => {
    const withDetail = shellSessionReducer(base(), {
      type: 'sidebar/openDetail',
      layerId: 'transit',
    });
    const hidden = shellSessionReducer(withDetail, {
      type: 'cleanView/toggle',
    });
    const restored = shellSessionReducer(hidden, { type: 'cleanView/toggle' });
    expect(restored.cleanView).toBe(false);
    expect(restored.sidebar.view).toEqual({
      kind: 'detail',
      layerId: 'transit',
    });
  });
});

describe('escape ladder', () => {
  it('leaves a modal to its own focus trap', () => {
    const state = base({ activeModal: 'export', cleanView: true });
    expect(shellSessionReducer(state, { type: 'escape' })).toBe(state);
  });

  it('returns a layer detail to overview before leaving clean view', () => {
    const state = base({
      cleanView: true,
      sidebar: {
        width: SIDEBAR_WIDTH.preferred,
        collapsed: false,
        view: { kind: 'detail', layerId: 'transit' },
      },
    });
    const afterFirst = shellSessionReducer(state, { type: 'escape' });
    expect(afterFirst.sidebar.view.kind).toBe('overview');
    expect(afterFirst.cleanView).toBe(true);

    const afterSecond = shellSessionReducer(afterFirst, { type: 'escape' });
    expect(afterSecond.cleanView).toBe(false);
  });

  it('is inert once nothing transient is open', () => {
    const state = base();
    expect(shellSessionReducer(state, { type: 'escape' })).toBe(state);
  });
});

describe('view mode', () => {
  it('starts geographic and toggles round-trip', () => {
    const state = base();
    expect(state.viewMode).toBe('geographic');
    const schematic = shellSessionReducer(state, { type: 'viewMode/toggle' });
    expect(schematic.viewMode).toBe('schematic');
    const back = shellSessionReducer(schematic, { type: 'viewMode/toggle' });
    expect(back.viewMode).toBe('geographic');
  });

  it('cannot toggle under a blocking surface', () => {
    const state = base({ activeModal: 'about' });
    expect(shellSessionReducer(state, { type: 'viewMode/toggle' })).toBe(state);
  });

  it('resets to geographic, and is a no-op when already there', () => {
    const state = base({ viewMode: 'schematic' });
    expect(
      shellSessionReducer(state, { type: 'viewMode/reset' }).viewMode,
    ).toBe('geographic');
    const geo = base();
    expect(shellSessionReducer(geo, { type: 'viewMode/reset' })).toBe(geo);
  });
});

describe('escape ladder — schematic view', () => {
  it('returns from the schematic view to the geographic map', () => {
    const state = base({ viewMode: 'schematic' });
    expect(shellSessionReducer(state, { type: 'escape' }).viewMode).toBe(
      'geographic',
    );
  });

  it('leaves Clean view before the schematic view, and yields to a modal', () => {
    const both = base({ viewMode: 'schematic', cleanView: true });
    const first = shellSessionReducer(both, { type: 'escape' });
    expect(first.cleanView).toBe(false);
    expect(first.viewMode).toBe('schematic');
    const modal = base({ viewMode: 'schematic', activeModal: 'about' });
    expect(shellSessionReducer(modal, { type: 'escape' })).toBe(modal);
  });
});

describe('schematic selection (Story 4.2)', () => {
  it('starts with every mode visible', () => {
    expect(initialShellSession(1440).schematic.hiddenModes).toEqual([]);
  });

  it('toggles a mode off and back on', () => {
    let state = shellSessionReducer(base(), {
      type: 'schematic/toggleMode',
      mode: 'Bus',
    });
    expect(state.schematic.hiddenModes).toEqual(['Bus']);
    state = shellSessionReducer(state, {
      type: 'schematic/toggleMode',
      mode: 'Tram',
    });
    expect(state.schematic.hiddenModes).toEqual(['Bus', 'Tram']);
    state = shellSessionReducer(state, {
      type: 'schematic/toggleMode',
      mode: 'Bus',
    });
    expect(state.schematic.hiddenModes).toEqual(['Tram']);
  });

  it('refuses to hide Unknown, which has no control to bring it back', () => {
    const state = base();
    expect(
      shellSessionReducer(state, {
        type: 'schematic/toggleMode',
        mode: 'Unknown',
      }),
    ).toBe(state);
  });

  it('restores every mode at once, and resets with the city', () => {
    const filtered = base({
      schematic: {
        width: 320,
        hiddenModes: ['Bus'],
        widthBeforeNarrow: null,
      },
    });
    // "Show all" is about the selection and leaves the width alone.
    const restored = shellSessionReducer(filtered, {
      type: 'schematic/showAllModes',
    });
    expect(restored.schematic.hiddenModes).toEqual([]);
    expect(restored.schematic.width).toBe(320);

    // A new city resets the whole schematic context, width included, to what
    // the current window would have started it with.
    const reset = shellSessionReducer(filtered, {
      type: 'schematic/reset',
      windowWidth: 1440,
    });
    expect(reset.schematic.hiddenModes).toEqual([]);
    expect(reset.schematic.width).toBe(SIDEBAR_WIDTH.preferred);
    expect(
      shellSessionReducer(filtered, {
        type: 'schematic/reset',
        windowWidth: 900,
      }).schematic.width,
    ).toBe(SIDEBAR_WIDTH.min);
  });

  it('keeps its own width, independent of the geographic sidebar', () => {
    const state = shellSessionReducer(base(), {
      type: 'schematic/setWidth',
      width: 300,
    });
    expect(state.schematic.width).toBe(300);
    expect(state.sidebar.width).toBe(SIDEBAR_WIDTH.preferred);
    // Same clamping model as the geographic one.
    expect(
      shellSessionReducer(state, { type: 'schematic/setWidth', width: 9999 })
        .schematic.width,
    ).toBe(SIDEBAR_WIDTH.max);
  });

  it('does not let the geographic sidebar width leak into it', () => {
    const state = shellSessionReducer(base(), {
      type: 'sidebar/setWidth',
      width: 310,
    });
    expect(state.schematic.width).toBe(SIDEBAR_WIDTH.preferred);
  });
});

describe('preserving the hidden geographic context', () => {
  it('keeps an open layer detail when the window narrows in the schematic', () => {
    const withDetail = base({
      viewMode: 'schematic',
      sidebar: {
        ...base().sidebar,
        view: { kind: 'detail', layerId: 'transit' },
      },
    });
    const resized = shellSessionReducer(withDetail, {
      type: 'sidebar/viewportResized',
      width: 1000,
    });
    expect(resized.sidebar.view).toEqual({
      kind: 'detail',
      layerId: 'transit',
    });
    // The schematic sidebar stays expanded but takes the narrow width.
    expect(resized.schematic.width).toBe(SIDEBAR_WIDTH.min);
  });

  it('gives the schematic width back when there is room for it again', () => {
    const wide = shellSessionReducer(base(), {
      type: 'schematic/setWidth',
      width: 320,
    });
    const narrow = shellSessionReducer(wide, {
      type: 'sidebar/viewportResized',
      width: 1000,
    });
    expect(narrow.schematic.width).toBe(SIDEBAR_WIDTH.min);

    const roomy = shellSessionReducer(narrow, {
      type: 'sidebar/viewportResized',
      width: 1440,
    });
    expect(roomy.schematic.width).toBe(320);
  });

  it('keeps a width chosen while narrow, the way a deliberate collapse sticks', () => {
    const narrow = shellSessionReducer(base(), {
      type: 'sidebar/viewportResized',
      width: 1000,
    });
    const chosen = shellSessionReducer(narrow, {
      type: 'schematic/setWidth',
      width: 260,
    });
    const roomy = shellSessionReducer(chosen, {
      type: 'sidebar/viewportResized',
      width: 1440,
    });
    expect(roomy.schematic.width).toBe(260);
  });

  it('still drops the detail when the window narrows on the map itself', () => {
    const withDetail = base({
      sidebar: {
        ...base().sidebar,
        view: { kind: 'detail', layerId: 'transit' },
      },
    });
    expect(
      shellSessionReducer(withDetail, {
        type: 'sidebar/viewportResized',
        width: 1000,
      }).sidebar.view,
    ).toEqual({ kind: 'overview' });
  });

  it('Escape leaves the schematic without closing the detail behind it', () => {
    const state = base({
      viewMode: 'schematic',
      sidebar: {
        ...base().sidebar,
        view: { kind: 'detail', layerId: 'roads' },
      },
    });
    const escaped = shellSessionReducer(state, { type: 'escape' });
    expect(escaped.viewMode).toBe('geographic');
    expect(escaped.sidebar.view).toEqual({ kind: 'detail', layerId: 'roads' });
  });
});

describe('schematic layout (Story 4.3)', () => {
  it('starts on the geographic layout, which is the only default', () => {
    expect(initialShellSession(1440).schematic.layoutId).toBe('geographic');
    expect(initialShellSession(900).schematic.layoutId).toBe('geographic');
  });

  it('switches layout without touching anything else', () => {
    const filtered = shellSessionReducer(
      shellSessionReducer(base(), { type: 'schematic/setWidth', width: 300 }),
      { type: 'schematic/toggleMode', mode: 'Bus' },
    );
    const switched = shellSessionReducer(filtered, {
      type: 'schematic/setLayout',
      layoutId: 'octilinear',
    });
    expect(switched.schematic.layoutId).toBe('octilinear');
    // Mode filters are semantic and the width is the sidebar's: neither is a
    // property of the geometry, so comparing layouts must not disturb them.
    expect(switched.schematic.hiddenModes).toEqual(['Bus']);
    expect(switched.schematic.width).toBe(300);
    expect(switched.sidebar).toBe(filtered.sidebar);
    expect(switched.viewMode).toBe(filtered.viewMode);
  });

  it('returns the same state when the layout is already the chosen one', () => {
    const state = shellSessionReducer(base(), {
      type: 'schematic/setLayout',
      layoutId: 'orthoradial',
    });
    expect(
      shellSessionReducer(state, {
        type: 'schematic/setLayout',
        layoutId: 'orthoradial',
      }),
    ).toBe(state);
  });

  it('remembers the lines a manual relayout was asked for, sorted', () => {
    const state = shellSessionReducer(base(), {
      type: 'schematic/relayout',
      lineIds: ['L2', 'L1'],
    });
    expect(state.schematic.relayoutLineIds).toEqual(['L1', 'L2']);
    // Asking for the layout already on screen must not make every consumer
    // memoised on the session redo it.
    expect(
      shellSessionReducer(state, {
        type: 'schematic/relayout',
        lineIds: ['L1', 'L2'],
      }),
    ).toBe(state);
  });

  it('hands the full layout back whenever the selection moves under it', () => {
    // A line switched back on has no geometry in a layout that was computed
    // without it. Drawing nothing for it would be a silent lie, so any change
    // to the selection — or to the geometry — returns to the full network.
    const relaid = shellSessionReducer(base(), {
      type: 'schematic/relayout',
      lineIds: ['L1'],
    });
    for (const action of [
      { type: 'schematic/toggleMode', mode: 'Bus' },
      { type: 'schematic/showAllModes' },
      { type: 'schematic/setLayout', layoutId: 'octilinear' },
    ] as const) {
      expect(
        shellSessionReducer(relaid, action).schematic.relayoutLineIds,
      ).toBeNull();
    }
  });

  it('goes back to geographic when a new city resets the session', () => {
    const state = shellSessionReducer(base(), {
      type: 'schematic/setLayout',
      layoutId: 'octilinear',
    });
    expect(
      shellSessionReducer(state, {
        type: 'schematic/reset',
        windowWidth: 1440,
      }).schematic.layoutId,
    ).toBe('geographic');
  });
});
