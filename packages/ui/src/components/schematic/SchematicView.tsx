import {
  placeSchematicLabels,
  rematerializeSchematicLayout,
  SCHEMATIC_DASH_PATTERN,
  SCHEMATIC_LINE_WIDTH,
  schematicTierStyle,
  type SchematicLabel,
  type SchematicLayout,
  type SchematicPoint,
  type SchematicSegment,
} from '@vellum/core';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { SchematicNetworkModel } from '../../hooks/use-schematic-network';
import {
  useSchematicCamera,
  type SchematicCameraControls,
} from './use-schematic-camera';

/**
 * Station outline width at scale 1, in viewBox units. Scaled by the camera like
 * every other metric: a constant in the stylesheet stayed the same number of
 * *viewBox* units, so the black ring swelled as the diagram was zoomed into.
 */
const STATION_OUTLINE_WIDTH = 1.2;

const pointsAttribute = (points: readonly SchematicPoint[]): string =>
  points.map((p) => `${p.x},${p.y}`).join(' ');

/**
 * Width, fade and dash of one stroke from its tier (Story 4.7). The width
 * follows the camera like every other metric, and so does the dash, which is
 * a multiple of the width drawn. A stroke without a tier draws as it always
 * did: full width, its own colour, no inline style.
 *
 * The fade is the colour mixed towards the background, not `opacity`: a
 * segment and its connector overlap at a joint, and two translucent strokes
 * would paint that overlap darker. Leaving `opacity` alone also keeps the
 * legend's highlight (`.schematic-view__dimmed`, CSS opacity) working.
 *
 * A dashed stroke is cut with butt caps: the stylesheet's round cap would add
 * half a width to each end of every dash and invert the 1:2 ink-to-gap ratio.
 * Inline style, because that CSS rule beats a presentation attribute.
 */
function strokeAttributes(
  segment: SchematicSegment,
  visualScale: number,
): {
  strokeWidth: number;
  strokeDasharray?: string;
  style?: React.CSSProperties;
} {
  const tier = schematicTierStyle(segment.tier);
  const strokeWidth = SCHEMATIC_LINE_WIDTH * tier.width * visualScale;
  const style: React.CSSProperties = {
    ...(tier.opacity < 1
      ? {
          stroke: `color-mix(in srgb, ${segment.color} ${Math.round(
            tier.opacity * 100,
          )}%, var(--color-bg))`,
        }
      : {}),
    ...(segment.dashed === true ? { strokeLinecap: 'butt' } : {}),
  };
  return {
    strokeWidth,
    ...(segment.dashed === true
      ? {
          strokeDasharray: SCHEMATIC_DASH_PATTERN.map(
            (factor) => factor * strokeWidth,
          ).join(' '),
        }
      : {}),
    ...(Object.keys(style).length > 0 ? { style } : {}),
  };
}

interface SchematicLayersProps {
  readonly layout: SchematicLayout;
  readonly labels: readonly SchematicLabel[];
  readonly visualScale: number;
  readonly hoveredLineId: string | null;
  readonly stationNameById: ReadonlyMap<string, string>;
  readonly onSelectStation: (stationId: string) => void;
}

/**
 * Everything drawn inside the diagram's `<svg>`, memoized on stable inputs.
 *
 * @remarks
 * Story 4.5: San Rico is ~6,500 elements, and reconciling them was the whole
 * cost of a pan step. Every prop here changes only when what is drawn does —
 * the layout and labels with the committed scale, the highlight with the
 * legend — so committing a camera that kept its scale reconciles nothing.
 */
const SchematicLayers = memo(function SchematicLayers({
  layout,
  labels,
  visualScale,
  hoveredLineId,
  stationNameById,
  onSelectStation,
}: SchematicLayersProps) {
  return (
    <>
      <g className="schematic-view__connectors">
        {layout.connectors.map((connector, index) => (
          <polyline
            key={`${connector.lineId}:${index}`}
            data-line-id={connector.lineId}
            className={
              hoveredLineId !== null && connector.lineId !== hoveredLineId
                ? 'schematic-view__dimmed'
                : undefined
            }
            points={pointsAttribute(connector.points)}
            stroke={connector.color}
            {...strokeAttributes(connector, visualScale)}
          />
        ))}
      </g>
      <g className="schematic-view__segments">
        {layout.segments.map((segment, index) => (
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
            {...strokeAttributes(segment, visualScale)}
          />
        ))}
      </g>
      <g
        className="schematic-view__stations"
        // Read by the outline and by the focus ring in the stylesheet; `px` in
        // SVG user space is one viewBox unit.
        style={
          {
            '--schematic-station-outline': `${STATION_OUTLINE_WIDTH * visualScale}px`,
          } as React.CSSProperties
        }
      >
        {layout.stations.map((station) => (
          <polygon
            key={station.id}
            data-station-id={station.id}
            points={pointsAttribute(station.shape)}
            // Station membership is what `lineIds` is for: a stop the
            // highlighted line does not call at recedes with the rest.
            className={
              hoveredLineId !== null && !station.lineIds.includes(hoveredLineId)
                ? 'schematic-view__dimmed'
                : undefined
            }
            tabIndex={stationNameById.has(station.id) ? 0 : undefined}
            aria-label={stationNameById.get(station.id)}
            onFocus={() => onSelectStation(station.id)}
            onClick={() => onSelectStation(station.id)}
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
            // Both in viewBox units, both from the same scale the placement
            // used, and both as *attributes*: a `font-size` in the stylesheet
            // would be a constant number of viewBox units, which is what made
            // a label grow to fill the screen as the camera zoomed in.
            const size = label.fontSize * visualScale;
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
    </>
  );
});

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
  /**
   * Filled with the camera's controls while the surface is mounted, so the
   * shell's zoom and fit commands (and the shared camera group) reach it the
   * way they reach the map's camera. Cleared on unmount.
   */
  cameraRef?: React.RefObject<SchematicCameraControls | null>;
}

/**
 * Independent schematic surface of the transit network (Epic 4).
 *
 * @remarks
 * This component draws; it derives nothing. The network, the layout and the
 * visibility projection all come from `useSchematicNetwork` at the common
 * ancestor, which is what lets the sidebar legend and these strokes be the
 * same data rather than two computations that happen to agree. It never writes
 * to the store, the theme or the layers, keeps its camera in
 * `useSchematicCamera`, and draws on a solid background with no geographic
 * layers.
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
 * Within each group the layout already comes lowest tier first (Story 4.7), so
 * the buses pass under the metro; each stroke's width, opacity and dash come
 * from its tier and mode.
 */
export const SchematicView = forwardRef<HTMLElement, SchematicViewProps>(
  function SchematicView(
    { model, onBack, onShowAllModes, hoveredLineId = null, cameraRef },
    ref,
  ) {
    const { t } = useTranslation();
    const { layout, hasDrawableNetwork, isFilteredEmpty } = model;
    const camera = useSchematicCamera(
      layout.bounds.width,
      layout.bounds.height,
    );
    const controls = camera.controls;
    useEffect(() => {
      if (!cameraRef) return;
      cameraRef.current = controls;
      return () => {
        if (cameraRef.current === controls) cameraRef.current = null;
      };
    }, [cameraRef, controls]);
    const renderedLayout = useMemo(
      () => rematerializeSchematicLayout(layout, camera.visualScale),
      [layout, camera.visualScale],
    );
    // Placed here, not in the model: how many names fit is a function of the
    // camera, and the camera lives on this surface. Both inputs are quantised —
    // the layout changes only when the selection does, `visualScale` only in
    // quarter octaves and only once a zoom gesture settles — so panning never
    // moves a label and a whole zoom gesture is one pass.
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
    // Stable, so the memoized layers are not re-rendered for a new closure.
    const selectStation = useCallback(
      (stationId: string) => setSelectedStationId(stationId),
      [],
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
              // No `viewBox` here: the camera writes it straight to the node,
              // once per frame, so a gesture never re-renders the diagram and a
              // re-render never snaps a gesture back (Story 4.5).
              ref={camera.svgRef}
              preserveAspectRatio="xMidYMid meet"
              aria-label={t('schematic.region')}
              onWheel={camera.onWheel}
              onPointerDown={camera.onPointerDown}
              onPointerMove={camera.onPointerMove}
              onPointerUp={camera.onPointerUp}
              onPointerCancel={camera.onPointerCancel}
              onLostPointerCapture={camera.onPointerCancel}
            >
              <SchematicLayers
                layout={renderedLayout}
                labels={labels}
                visualScale={camera.visualScale}
                hoveredLineId={hoveredLineId}
                stationNameById={stationNameById}
                onSelectStation={selectStation}
              />
            </svg>
          </>
        )}
      </section>
    );
  },
);
