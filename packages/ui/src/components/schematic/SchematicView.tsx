import {
  rematerializeSchematicLayout,
  SCHEMATIC_LINE_WIDTH,
  type SchematicPoint,
} from '@vellum/core';
import { Maximize } from 'lucide-react';
import { forwardRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SchematicNetworkModel } from '../../hooks/use-schematic-network';
import { useSchematicCamera } from './use-schematic-camera';

const pointsAttribute = (points: readonly SchematicPoint[]): string =>
  points.map((p) => `${p.x},${p.y}`).join(' ');

export interface SchematicViewProps {
  /**
   * The shared model the sidebar reads too, so a stroke and its legend row can
   * never disagree about what is drawn.
   */
  model: SchematicNetworkModel;
  /** Returns to the geographic map (the `view.schematic` command). */
  onBack: () => void;
  /** Brings every switched-off mode back — the way out of an empty filter. */
  onShowAllModes: () => void;
  /**
   * The line the user is pointing at in the legend, or `null`. Everything else
   * is held back while it is set; the highlighted line keeps its own colour.
   */
  hoveredLineId?: string | null;
}

/**
 * Independent schematic surface of the transit network (Epic 4).
 *
 * @remarks
 * This component draws; it derives nothing. The network, the layout and the
 * visibility projection all come from `useSchematicNetwork` at the common
 * ancestor, which is what lets the sidebar legend and these strokes be the
 * same data rather than two computations that happen to agree. It never writes
 * to the store, the camera, the theme or the layers, has no camera of its own,
 * and draws on a solid background with no geographic layers.
 *
 * Station *labels* are deliberately absent: placing them is the layout
 * strategy's job (Story 4.4), not this surface's.
 *
 * The geometry is the layout's, down to the stroke width. `strokeWidth` is set
 * here from {@link SCHEMATIC_LINE_WIDTH} rather than in CSS because the layout's
 * per-line offsets are in **viewBox units**: a width in screen pixels (which is
 * what `vector-effect: non-scaling-stroke` gave) cannot agree with them at any
 * zoom, so parallel lines would either overlap or leave a gap depending on the
 * window. Station fill and outline are fixed black-on-white in both themes, the
 * same convention and the same reason as the geographic map's marker layer: it is
 * LOOM's, not the theme's, and one datum must not be drawn two ways.
 *
 * Drawing order matches the map's layer order — inner connections, then lines,
 * then stations — so a joint reads as passing behind the strokes it joins.
 */
export const SchematicView = forwardRef<HTMLElement, SchematicViewProps>(
  function SchematicView(
    { model, onBack, onShowAllModes, hoveredLineId = null },
    ref,
  ) {
    const { t } = useTranslation();
    const { layout, hasDrawableNetwork, isFilteredEmpty } = model;
    const camera = useSchematicCamera(
      layout.bounds.width,
      layout.bounds.height,
    );
    const renderedLayout = useMemo(
      () => rematerializeSchematicLayout(layout, camera.visualScale),
      [layout, camera.visualScale],
    );

    return (
      <section
        ref={ref}
        tabIndex={-1}
        className="schematic-view"
        data-testid="schematic-view"
        role="region"
        aria-label={t('schematic.region')}
      >
        {!hasDrawableNetwork ? (
          // Nothing to draw and nothing to restore: the only move left is out.
          <div className="schematic-view__empty" data-testid="schematic-empty">
            <h2 className="schematic-view__empty-title">
              {t('schematic.emptyTitle')}
            </h2>
            <p className="schematic-view__empty-body">
              {t('schematic.emptyBody')}
            </p>
            <button
              type="button"
              className="schematic-view__back"
              data-focus-id="schematic-back"
              onClick={onBack}
            >
              {t('schematic.back')}
            </button>
          </div>
        ) : isFilteredEmpty ? (
          // A filtered-empty network is a different situation from an empty
          // city: the network is there, the selection is hiding it, and saying
          // so is what makes the state recoverable.
          <div
            className="schematic-view__empty"
            data-testid="schematic-filtered-empty"
          >
            <h2 className="schematic-view__empty-title">
              {t('schematic.filteredTitle')}
            </h2>
            <p className="schematic-view__empty-body">
              {t('schematic.filteredBody')}
            </p>
            <button
              type="button"
              className="schematic-view__back"
              onClick={onShowAllModes}
            >
              {t('schematic.showAllModes')}
            </button>
          </div>
        ) : (
          <>
            <p className="sr-only" data-testid="schematic-summary">
              {t('schematic.summary', {
                lines: model.visibleLineCount,
                stations: renderedLayout.stations.length,
              })}
            </p>
            <svg
              className="schematic-view__diagram"
              data-testid="schematic-diagram"
              viewBox={`${camera.viewBox.x} ${camera.viewBox.y} ${camera.viewBox.width} ${camera.viewBox.height}`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
              onWheel={camera.onWheel}
              onPointerDown={camera.onPointerDown}
              onPointerMove={camera.onPointerMove}
              onPointerUp={camera.onPointerUp}
              onPointerCancel={camera.onPointerCancel}
              onLostPointerCapture={camera.onPointerCancel}
            >
              <g className="schematic-view__connectors">
                {renderedLayout.connectors.map((connector, index) => (
                  <polyline
                    key={`${connector.lineId}:${index}`}
                    data-line-id={connector.lineId}
                    className={
                      hoveredLineId !== null &&
                      connector.lineId !== hoveredLineId
                        ? 'schematic-view__dimmed'
                        : undefined
                    }
                    points={pointsAttribute(connector.points)}
                    stroke={connector.color}
                    strokeWidth={SCHEMATIC_LINE_WIDTH * camera.visualScale}
                  />
                ))}
              </g>
              <g className="schematic-view__segments">
                {renderedLayout.segments.map((segment, index) => (
                  <polyline
                    key={`${segment.lineId}:${index}`}
                    data-line-id={segment.lineId}
                    className={
                      hoveredLineId !== null && segment.lineId !== hoveredLineId
                        ? 'schematic-view__dimmed'
                        : undefined
                    }
                    points={pointsAttribute(segment.points)}
                    stroke={segment.color}
                    strokeWidth={SCHEMATIC_LINE_WIDTH * camera.visualScale}
                  />
                ))}
              </g>
              <g className="schematic-view__stations">
                {renderedLayout.stations.map((station) => (
                  <polygon
                    key={station.id}
                    data-station-id={station.id}
                    points={pointsAttribute(station.shape)}
                    // Station membership is what `lineIds` is for: a stop the
                    // highlighted line does not call at recedes with the rest.
                    className={
                      hoveredLineId !== null &&
                      !station.lineIds.includes(hoveredLineId)
                        ? 'schematic-view__dimmed'
                        : undefined
                    }
                  />
                ))}
              </g>
            </svg>
            <button
              type="button"
              className="schematic-view__fit"
              onClick={camera.fit}
              aria-label={t('schematic.fit')}
              title={t('schematic.fit')}
            >
              <Maximize aria-hidden="true" />
            </button>
          </>
        )}
      </section>
    );
  },
);
