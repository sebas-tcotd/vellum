import {
  placeSchematicLabels,
  rematerializeSchematicLayout,
  SCHEMATIC_LINE_WIDTH,
  type SchematicPoint,
} from '@vellum/core';
import { Maximize } from 'lucide-react';
import { forwardRef, useMemo, useState } from 'react';
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
 * Labels are *placed* here rather than in the model, and that is deliberate:
 * how many names fit is a function of the camera, so the same diagram carries
 * more of them the further in it is zoomed. The model supplies the names, this
 * surface supplies the scale, and `placeSchematicLabels` decides.
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
    // Placed here, not in the model: how many names fit is a function of the
    // camera, and the camera lives on this surface. Both inputs are quantised —
    // the layout changes only when the selection does, `visualScale` only in
    // eighths — so panning never moves a label and a zoom step is one pass.
    const labels = useMemo(
      () =>
        placeSchematicLabels(
          renderedLayout,
          model.labelSources.lines,
          model.labelSources.stations,
          { scale: camera.visualScale },
        ),
      [renderedLayout, model.labelSources, camera.visualScale],
    );
    const stationNameById = useMemo(
      () =>
        new Map(
          model.labelSources.stations.flatMap((station) =>
            station.name === null ? [] : [[station.id, station.name] as const],
          ),
        ),
      [model.labelSources],
    );
    const [selectedStationId, setSelectedStationId] = useState<string | null>(
      null,
    );
    const selectedStationName = selectedStationId
      ? (stationNameById.get(selectedStationId) ?? null)
      : null;

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
            <ul className="sr-only" aria-label={t('schematic.details')}>
              {labels.map((label) => (
                <li key={label.id}>{label.accessibleName}</li>
              ))}
            </ul>
            {selectedStationName && (
              <aside
                className="schematic-view__detail"
                aria-live="polite"
                data-testid="schematic-station-detail"
              >
                <strong>{selectedStationName}</strong>
                <button
                  type="button"
                  onClick={() => setSelectedStationId(null)}
                  aria-label={t('common.close')}
                >
                  ×
                </button>
              </aside>
            )}
            <svg
              className="schematic-view__diagram"
              data-testid="schematic-diagram"
              viewBox={`${camera.viewBox.x} ${camera.viewBox.y} ${camera.viewBox.width} ${camera.viewBox.height}`}
              preserveAspectRatio="xMidYMid meet"
              aria-label={t('schematic.region')}
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
                    tabIndex={stationNameById.has(station.id) ? 0 : undefined}
                    aria-label={stationNameById.get(station.id)}
                    onFocus={() => setSelectedStationId(station.id)}
                    onClick={() => setSelectedStationId(station.id)}
                  >
                    {stationNameById.has(station.id) && (
                      <title>{stationNameById.get(station.id)}</title>
                    )}
                  </polygon>
                ))}
              </g>
              <g className="schematic-view__labels" aria-hidden="true">
                {labels
                  .filter((label) => label.text !== null)
                  .map((label) => {
                    // Both in viewBox units, both from the same scale the
                    // placement used, and both as *attributes*: a `font-size`
                    // in the stylesheet would be a constant number of viewBox
                    // units, which is what made a label grow to fill the screen
                    // as the camera zoomed in.
                    const size = label.fontSize * camera.visualScale;
                    return (
                      <text
                        key={label.id}
                        x={label.x}
                        y={label.y}
                        textAnchor={label.anchor}
                        transform={`rotate(${label.angle} ${label.x} ${label.y})`}
                        fontSize={size}
                        strokeWidth={size * 0.3}
                        fill={label.color ?? 'currentColor'}
                        className={`schematic-view__label schematic-view__label--${label.kind}`}
                      >
                        {label.text}
                      </text>
                    );
                  })}
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
