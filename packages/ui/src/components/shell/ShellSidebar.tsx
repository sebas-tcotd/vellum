import { useLayoutEffect, useRef, useState } from 'react';
import {
  FloatingLayerPanel,
  type FloatingLayerPanelProps,
  type PanelState,
} from '../panels/FloatingLayerPanel';

export interface ShellSidebarProps extends FloatingLayerPanelProps {
  isCleanMode: boolean;
}

/**
 * Tool pane inline del mapa. Su ancho participa en el layout; no se superpone
 * a la superficie cartográfica. Clean Mode lo retira sin perder su estado.
 */
export function ShellSidebar({
  isCleanMode,
  onStateChange: externalOnStateChange,
  ...panelProps
}: ShellSidebarProps) {
  const [state, setState] = useState<PanelState>('expanded');
  const sidebarRef = useRef<HTMLElement>(null);
  const focusBeforeCleanModeRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    if (isCleanMode) {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        sidebar.contains(activeElement)
      ) {
        focusBeforeCleanModeRef.current = activeElement;
        activeElement.blur();
      }
      return;
    }

    if (document.activeElement === document.body) {
      focusBeforeCleanModeRef.current?.focus();
    }
    focusBeforeCleanModeRef.current = null;
  }, [isCleanMode]);

  return (
    <aside
      ref={sidebarRef}
      className="shell-sidebar"
      data-testid="shell-sidebar"
      data-state={state}
      hidden={isCleanMode}
      aria-hidden={isCleanMode ? true : undefined}
    >
      <FloatingLayerPanel
        {...panelProps}
        onStateChange={(nextState) => {
          setState(nextState);
          externalOnStateChange?.(nextState);
        }}
      />
    </aside>
  );
}
