import { forwardRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deriveTransitNetwork,
  geographicSchematicLayout,
  isSchematicLayoutEmpty,
  type CityData,
  type SchematicLayoutStrategy,
} from '@vellum/core';

export interface SchematicViewProps {
  cityData: CityData;
  /** Returns to the geographic map (the `view.schematic` command). */
  onBack: () => void;
  /** Layout strategy; the geographic projection is the Story 4.1 baseline. */
  strategy?: SchematicLayoutStrategy;
}

/**
 * Independent schematic surface of the transit network (Epic 4).
 *
 * @remarks
 * Everything is derived from `deriveTransitNetwork(cityData)`; this component
 * never writes to the store, the camera, the theme or the layers. It draws on
 * a solid background with no geographic layers, and has no camera of its own.
 */
export const SchematicView = forwardRef<HTMLElement, SchematicViewProps>(
  function SchematicView(
    { cityData, onBack, strategy = geographicSchematicLayout },
    ref,
  ) {
    const { t } = useTranslation();
    const layout = useMemo(
      () => strategy(deriveTransitNetwork(cityData)),
      [cityData, strategy],
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
        {isSchematicLayoutEmpty(layout) ? (
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
        ) : (
          <>
            <p className="sr-only" data-testid="schematic-summary">
              {t('schematic.summary', {
                lines: new Set(layout.segments.map((s) => s.lineId)).size,
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
