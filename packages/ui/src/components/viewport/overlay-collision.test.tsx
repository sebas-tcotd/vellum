import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useRef } from 'react';
import { act, render, screen } from '../../test-utils';
import {
  OVERLAY_PRIORITY,
  OverlayCollisionProvider,
  useOverlaySlot,
  type OverlayAnchor,
  type OverlayId,
} from './overlay-collision';

const VIEWPORT = { width: 1000, height: 800 };

/**
 * jsdom gives every element a zero rect, so the manager would have nothing to
 * measure. Each element declares the box it "occupies" through a data
 * attribute and this stub reports it — the manager still does all the
 * geometry, it just gets real numbers to work with.
 */
function stubLayout() {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const box = (this as HTMLElement).dataset?.box;
    if (this.getAttribute('data-viewport') !== null) {
      return {
        left: 0,
        top: 0,
        right: VIEWPORT.width,
        bottom: VIEWPORT.height,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
      } as DOMRect;
    }
    if (!box)
      return {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
      } as DOMRect;
    const [left, top, right, bottom] = box.split(',').map(Number) as [
      number,
      number,
      number,
      number,
    ];
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    } as DOMRect;
  };
}

function Slot({
  id,
  anchor,
  box,
}: {
  id: OverlayId;
  anchor: OverlayAnchor;
  box: string;
}) {
  const { ref, style } = useOverlaySlot(id, anchor);
  return <div ref={ref} data-testid={id} data-box={box} style={style} />;
}

function Harness({ children }: { children: React.ReactNode }) {
  const viewportRef = useRef<HTMLElement>(null);
  return (
    <section ref={viewportRef} data-viewport="">
      <OverlayCollisionProvider viewportRef={viewportRef}>
        {children}
      </OverlayCollisionProvider>
    </section>
  );
}

beforeEach(() => {
  stubLayout();
  // The provider measures on ResizeObserver callbacks; the test-setup mock
  // never fires, so drive a measurement explicitly after mount instead.
  global.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {
      queueMicrotask(() => this.cb([], this as never));
    }
    observe() {
      queueMicrotask(() => this.cb([], this as never));
    }
    unobserve() {}
    disconnect() {}
  } as never;
});

const bottomOf = (id: string) =>
  (screen.getByTestId(id) as HTMLElement).style.bottom;

describe('overlay priority', () => {
  it('orders attribution and the minimap above the displaceable overlays', () => {
    expect(OVERLAY_PRIORITY.indexOf('attribution')).toBeLessThan(
      OVERLAY_PRIORITY.indexOf('legend'),
    );
    expect(OVERLAY_PRIORITY.indexOf('minimap')).toBeLessThan(
      OVERLAY_PRIORITY.indexOf('status'),
    );
    expect(OVERLAY_PRIORITY.indexOf('camera')).toBeLessThan(
      OVERLAY_PRIORITY.indexOf('legend'),
    );
  });
});

describe('placement', () => {
  it('leaves an overlay at its anchor when nothing else is there', async () => {
    await act(async () => {
      render(
        <Harness>
          <Slot id="legend" anchor="bottom-left" box="12,700,200,788" />
        </Harness>,
      );
    });
    expect(bottomOf('legend')).toBe('12px');
  });

  it('pushes a lower-priority overlay clear of the attribution edge', async () => {
    await act(async () => {
      render(
        <Harness>
          {/* Attribution spans the bottom edge, 20 px tall. */}
          <Slot id="attribution" anchor="bottom-left" box="0,768,1000,788" />
          <Slot id="legend" anchor="bottom-left" box="12,700,200,788" />
        </Harness>,
      );
    });
    // Cleared above the measured attribution band rather than a guessed offset.
    expect(bottomOf('legend')).toBe('40px');
    expect(bottomOf('attribution')).toBe('12px');
  });

  it('does not displace an overlay that shares no horizontal band', async () => {
    await act(async () => {
      render(
        <Harness>
          {/* Minimap owns the lower-right corner only. */}
          <Slot id="minimap" anchor="bottom-right" box="828,628,988,788" />
          <Slot id="legend" anchor="bottom-left" box="12,700,200,788" />
        </Harness>,
      );
    });
    // The legend is nowhere near the minimap, so it stays put — collision
    // handling reacts to actual overlap, not to a blanket reserved corner.
    expect(bottomOf('legend')).toBe('12px');
  });

  it('never moves a higher-priority overlay out of a lower one’s way', async () => {
    await act(async () => {
      render(
        <Harness>
          <Slot id="minimap" anchor="bottom-right" box="828,628,988,788" />
          <Slot id="status" anchor="bottom-right" box="828,700,988,788" />
        </Harness>,
      );
    });
    expect(bottomOf('minimap')).toBe('12px');
    expect(bottomOf('status')).not.toBe('12px');
  });
});
