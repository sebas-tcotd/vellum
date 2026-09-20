import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { SchematicNetworkModel } from '../../hooks/use-schematic-network';

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
 */
export const SchematicView = forwardRef<HTMLElement, SchematicViewProps>(
  function SchematicView(
    { model, onBack, onShowAllModes, hoveredLineId = null },
    ref,
  ) {
    const { t } = useTranslation();
    const { layout, hasDrawableNetwork, isFilteredEmpty } = model;

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
                stations: layout.stations.length,
              })}
            </p>
            <svg
              className="schematic-view__diagram"
              data-testid="schematic-diagram"
              viewBox={`0 0 ${layout.bounds.width} ${layout.bounds.height}`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
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
                    points={segment.points
                      .map((p) => `${p.x},${p.y}`)
                      .join(' ')}
                    stroke={segment.color}
                  />
                ))}
              </g>
              <g className="schematic-view__stations">
                {layout.stations.map((station) => (
                  <circle
                    key={station.id}
                    cx={station.x}
                    cy={station.y}
                    r={4}
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
          </>
        )}
      </section>
    );
  },
);
