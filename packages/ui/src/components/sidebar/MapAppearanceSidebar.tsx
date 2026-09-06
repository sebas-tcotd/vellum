import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { LAYER_NAMES } from '@vellum/core';
import type { CommandRegistry } from '../../shell/commands';
import type { ShellSession } from '../../shell/shell-session';
import { LAYER_ICONS } from './layer-presentation';
import { DocumentContextHeader } from './DocumentContextHeader';
import { LayerDetailPanel } from './LayerDetailPanel';
import { MapAppearanceOverview } from './MapAppearanceOverview';
import { useVellumStore } from '../../store/vellum-store';
import { SidebarResizeHandle } from './SidebarResizeHandle';

export interface MapAppearanceSidebarProps {
  cityName: string;
  fileName: string;
  commands: CommandRegistry;
  shell: ShellSession;
  /**
   * Reports how much of the map's leading edge the sidebar covers, measured
   * rather than derived from its width: platform profiles inset it by
   * different amounts, and the map has to be framed around what is actually
   * there.
   */
  onOccupiedWidthChange?: (width: number) => void;
}

/**
 * The docked map-appearance workspace.
 *
 * @remarks
 * It participates in layout rather than floating over the map, and has exactly
 * two body states: the appearance overview, and one layer's detail (AD-4). It
 * is not document navigation and it does not host export — output is a
 * document workflow with its own route (AD-6).
 */
export function MapAppearanceSidebar({
  cityName,
  fileName,
  commands,
  shell,
  onOccupiedWidthChange,
}: MapAppearanceSidebarProps) {
  const { t } = useTranslation();
  const { state, dispatch } = shell;
  const { collapsed, view, width } = state.sidebar;
  const sidebarRef = useRef<HTMLElement>(null);
  const focusBeforeCleanViewRef = useRef<HTMLElement | null>(null);
  const isCleanView = state.cleanView;

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar || !onOccupiedWidthChange) return;
    const report = () =>
      onOccupiedWidthChange(
        isCleanView ? 0 : sidebar.offsetLeft + sidebar.offsetWidth,
      );
    report();
    const observer = new ResizeObserver(report);
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, [onOccupiedWidthChange, isCleanView, collapsed, width]);

  // Clean view hides this subtree. Focus cannot be left inside a hidden tree,
  // so it is parked here and handed back on return — the behaviour the shell
  // has always had, kept intact through the migration.
  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    if (isCleanView) {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        sidebar.contains(activeElement)
      ) {
        focusBeforeCleanViewRef.current = activeElement;
        activeElement.blur();
      }
      return;
    }

    if (document.activeElement === document.body) {
      focusBeforeCleanViewRef.current?.focus();
    }
    focusBeforeCleanViewRef.current = null;
  }, [isCleanView]);

  // Back / Escape out of a detail returns focus to the disclosure that opened
  // it, or to the overview heading when the detail was opened from the menu or
  // a shortcut and has no on-screen invoker.
  const previousViewKind = useRef(view.kind);
  useEffect(() => {
    const leftDetail =
      previousViewKind.current === 'detail' && view.kind === 'overview';
    previousViewKind.current = view.kind;
    if (!leftDetail || isCleanView) return;

    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const invoker = state.restoreFocus
      ? sidebar.querySelector<HTMLElement>(
          `[data-focus-id="${state.restoreFocus}"]`,
        )
      : null;
    (
      invoker ?? sidebar.querySelector<HTMLElement>('#shell-map-style-heading')
    )?.focus();
    dispatch({ type: 'focus/consume' });
  }, [view.kind, state.restoreFocus, isCleanView, dispatch]);

  return (
    <aside
      ref={sidebarRef}
      className="shell-sidebar"
      data-testid="shell-sidebar"
      data-state={collapsed ? 'collapsed' : 'expanded'}
      style={collapsed ? undefined : { width }}
      aria-label={t('a11y.mapAppearance')}
      hidden={isCleanView}
      aria-hidden={isCleanView ? true : undefined}
    >
      <DocumentContextHeader
        cityName={cityName}
        fileName={fileName}
        collapsed={collapsed}
        onToggleCollapsed={() =>
          dispatch({ type: 'sidebar/setCollapsed', collapsed: !collapsed })
        }
      />
      <div className="shell-sidebar__body">
        {collapsed ? (
          <CompactLayerRail commands={commands} />
        ) : view.kind === 'overview' ? (
          <MapAppearanceOverview commands={commands} />
        ) : (
          <LayerDetailPanel
            layer={view.layerId}
            onBack={() => dispatch({ type: 'sidebar/closeDetail' })}
          />
        )}
      </div>
      {!collapsed && (
        <SidebarResizeHandle
          width={width}
          onResize={(next) =>
            dispatch({ type: 'sidebar/setWidth', width: next })
          }
        />
      )}
    </aside>
  );
}

/**
 * The 56 px rail. It keeps layer visibility reachable and nothing else —
 * style and detail need the expanded sidebar, per the width model.
 */
function CompactLayerRail({ commands }: { commands: CommandRegistry }) {
  const { t } = useTranslation();
  const activeLayers = useVellumStore((s) => s.activeLayers);

  return (
    <div className="shell-rail" role="group" aria-label={t('sidebar.layers')}>
      {LAYER_NAMES.map((layer) => {
        const Icon = LAYER_ICONS[layer];
        const name = t(`layers.${layer}`);
        return (
          <button
            key={layer}
            type="button"
            className="shell-rail__item"
            data-state={activeLayers[layer] ? 'on' : 'off'}
            aria-label={name}
            aria-pressed={activeLayers[layer]}
            title={name}
            onClick={() => commands['layer.toggle'].execute(layer)}
          >
            <span aria-hidden="true" className="shell-rail__icon">
              <Icon size={20} strokeWidth={1.5} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
