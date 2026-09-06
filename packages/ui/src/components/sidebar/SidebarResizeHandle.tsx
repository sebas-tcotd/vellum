import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SIDEBAR_RESIZE_MIN_WINDOW,
  SIDEBAR_WIDTH,
} from '../../shell/shell-session';

export interface SidebarResizeHandleProps {
  width: number;
  onResize: (width: number) => void;
}

/** How much one arrow-key press changes the width. */
const KEYBOARD_STEP = 8;

/**
 * Drag handle on the sidebar's trailing edge.
 *
 * @remarks
 * Offered only at 1280 px and wider, per the width model — below that the
 * sidebar keeps its default and the map needs every pixel it can get. It is a
 * real separator widget rather than a bare drag target: arrow keys resize it
 * in steps and Home/End jump to the bounds, so the control is not
 * pointer-only.
 */
export function SidebarResizeHandle({
  width,
  onResize,
}: SidebarResizeHandleProps) {
  const { t } = useTranslation();
  const [canResize, setCanResize] = useState(
    () =>
      typeof window === 'undefined' ||
      window.innerWidth >= SIDEBAR_RESIZE_MIN_WINDOW,
  );
  const draggingRef = useRef(false);

  useEffect(() => {
    const onWindowResize = () =>
      setCanResize(window.innerWidth >= SIDEBAR_RESIZE_MIN_WINDOW);
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!draggingRef.current) return;
      onResize(event.clientX);
    },
    [onResize],
  );

  const stopDragging = useCallback(() => {
    draggingRef.current = false;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', stopDragging);
  }, [handlePointerMove]);

  useEffect(() => stopDragging, [stopDragging]);

  if (!canResize) return null;

  return (
    <div
      className="shell-resize-handle"
      data-testid="sidebar-resize-handle"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={t('sidebar.resize')}
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      onPointerDown={(event) => {
        event.preventDefault();
        draggingRef.current = true;
        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', stopDragging);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') onResize(width - KEYBOARD_STEP);
        else if (event.key === 'ArrowRight') onResize(width + KEYBOARD_STEP);
        else if (event.key === 'Home') onResize(SIDEBAR_WIDTH.min);
        else if (event.key === 'End') onResize(SIDEBAR_WIDTH.max);
        else return;
        event.preventDefault();
      }}
    />
  );
}
