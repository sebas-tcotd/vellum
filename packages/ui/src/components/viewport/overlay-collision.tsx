import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefCallback,
} from 'react';

/**
 * Everything that can sit over the map. Order is priority, highest first
 * (AD-5): the first four hold their place, and only the last three are ever
 * repositioned to get out of their way.
 */
export const OVERLAY_PRIORITY = [
  'attribution',
  'minimap',
  'camera',
  'pinnedEntity',
  'hoverTooltip',
  'legend',
  'status',
] as const;

export type OverlayId = (typeof OVERLAY_PRIORITY)[number];

/** Where an overlay wants to sit, before collisions are resolved. */
export type OverlayAnchor = 'bottom-right' | 'bottom-left' | 'top-center';

/** Overlay rectangle in MapViewport coordinates — the one space they share. */
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface OverlayCollisionValue {
  register: (id: OverlayId, element: HTMLElement | null) => void;
  /**
   * How far a displaceable overlay at `anchor` must move up to clear every
   * higher-priority overlay it would otherwise overlap.
   */
  clearanceFor: (id: OverlayId, anchor: OverlayAnchor) => number;
}

const OverlayCollisionContext = createContext<OverlayCollisionValue | null>(
  null,
);

/** Distance every overlay keeps from the viewport edge, mirroring `--shell-overlay-inset`. */
const EDGE_INSET = 12;
/** Gap between two overlays that end up stacked in the same corner. */
const STACK_GAP = 8;

const priorityOf = (id: OverlayId): number => OVERLAY_PRIORITY.indexOf(id);

const horizontallyOverlaps = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right;

/**
 * Arbitrates overlay placement inside one MapViewport coordinate space.
 *
 * @remarks
 * Rectangles are measured, not assumed: every registered overlay is observed,
 * so a control group that grows a button or a legend that gains a row pushes
 * its neighbours by the amount it actually occupies. That is what keeps the
 * minimap corner and the attribution edge genuinely clear instead of clear
 * against a constant that was true when it was written.
 */
export function OverlayCollisionProvider({
  children,
  viewportRef,
}: {
  children: ReactNode;
  viewportRef: React.RefObject<HTMLElement | null>;
}) {
  const elements = useRef(new Map<OverlayId, HTMLElement>());
  const [rects, setRects] = useState<ReadonlyMap<OverlayId, Rect>>(new Map());
  // Taken from the same measurement pass as the overlay boxes, so clearance is
  // always computed against one consistent snapshot of the viewport.
  const [viewportHeight, setViewportHeight] = useState(0);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const origin = viewport.getBoundingClientRect();
    setViewportHeight(origin.height);
    const next = new Map<OverlayId, Rect>();
    for (const [id, element] of elements.current) {
      if (!element.isConnected) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      next.set(id, {
        left: box.left - origin.left,
        top: box.top - origin.top,
        right: box.right - origin.left,
        bottom: box.bottom - origin.top,
      });
    }
    setRects((previous) => (sameRects(previous, next) ? previous : next));
  }, [viewportRef]);

  // Measuring is always deferred: `register` runs from a ref callback during
  // commit, where the elements are not laid out yet and a synchronous state
  // update is illegal. One frame later the boxes are real.
  const scheduledRef = useRef(false);
  const scheduleMeasure = useCallback(() => {
    if (scheduledRef.current) return;
    scheduledRef.current = true;
    queueMicrotask(() => {
      scheduledRef.current = false;
      measure();
    });
  }, [measure]);

  const observerRef = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(() => scheduleMeasure());
    observerRef.current = observer;
    const viewport = viewportRef.current;
    if (viewport) observer.observe(viewport);
    for (const element of elements.current.values()) observer.observe(element);
    scheduleMeasure();
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [scheduleMeasure, viewportRef]);

  const register = useCallback(
    (id: OverlayId, element: HTMLElement | null) => {
      const existing = elements.current.get(id);
      if (existing === element) return;
      if (existing) observerRef.current?.unobserve(existing);
      if (element) {
        elements.current.set(id, element);
        observerRef.current?.observe(element);
      } else {
        elements.current.delete(id);
      }
      scheduleMeasure();
    },
    [scheduleMeasure],
  );

  const clearanceFor = useCallback(
    (id: OverlayId, anchor: OverlayAnchor) => {
      const own = rects.get(id);
      if (!own || viewportHeight === 0) return 0;
      const height = viewportHeight;

      let clearance = 0;
      for (const [otherId, other] of rects) {
        if (otherId === id) continue;
        if (priorityOf(otherId) >= priorityOf(id)) continue;
        if (!horizontallyOverlaps(own, other)) continue;

        if (anchor === 'top-center') {
          // Pushed down past anything above it.
          clearance = Math.max(
            clearance,
            other.bottom + STACK_GAP - EDGE_INSET,
          );
        } else {
          // Pushed up past anything occupying the bottom edge beneath it.
          clearance = Math.max(
            clearance,
            height - other.top + STACK_GAP - EDGE_INSET,
          );
        }
      }
      return Math.max(0, clearance);
    },
    [rects, viewportHeight],
  );

  const value = useMemo(
    () => ({ register, clearanceFor }),
    [register, clearanceFor],
  );

  return (
    <OverlayCollisionContext.Provider value={value}>
      {children}
    </OverlayCollisionContext.Provider>
  );
}

function sameRects(
  a: ReadonlyMap<OverlayId, Rect>,
  b: ReadonlyMap<OverlayId, Rect>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, rect] of a) {
    const other = b.get(id);
    if (
      !other ||
      other.left !== rect.left ||
      other.top !== rect.top ||
      other.right !== rect.right ||
      other.bottom !== rect.bottom
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Claims an overlay slot. Returns the ref to attach and the resolved position.
 *
 * @remarks
 * Components never write absolute offsets of their own — that is precisely the
 * scattered-constants problem this replaces. They declare an anchor and let
 * the manager place them.
 */
export function useOverlaySlot(
  id: OverlayId,
  anchor: OverlayAnchor,
): { ref: RefCallback<HTMLElement>; style: React.CSSProperties } {
  const context = useContext(OverlayCollisionContext);
  const ref = useCallback<RefCallback<HTMLElement>>(
    (element) => context?.register(id, element),
    [context, id],
  );
  const clearance = context?.clearanceFor(id, anchor) ?? 0;

  const style = useMemo<React.CSSProperties>(() => {
    const base: React.CSSProperties = { position: 'absolute', zIndex: 10 };
    if (anchor === 'top-center') {
      return {
        ...base,
        top: EDGE_INSET + clearance,
        left: '50%',
        transform: 'translateX(-50%)',
      };
    }
    return {
      ...base,
      bottom: EDGE_INSET + clearance,
      ...(anchor === 'bottom-right'
        ? { right: EDGE_INSET }
        : { left: EDGE_INSET }),
    };
  }, [anchor, clearance]);

  return { ref, style };
}
