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
