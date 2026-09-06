import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServiceIconLegendState } from '@vellum/renderer-webgl';
import type {
  MapLibreRootProps,
  MapViewportPort,
} from '../canvas/MapLibreRoot';
import { MapLibreRoot } from '../canvas/MapLibreRoot';
import { Minimap } from '../minimap/Minimap';
import { MapTooltip } from '../overlays/MapTooltip';
import { IconLegend } from '../panels/IconLegend';
import type { CommandRegistry } from '../../shell/commands';
import { DEFAULT_RENDER_STYLE_PARAMS } from '@vellum/theme-engine';
import { useVellumStore } from '../../store/vellum-store';
import { cn } from '../../lib/utils';
import { CameraControlGroup } from './CameraControlGroup';
import { DocumentCommandGroup } from './DocumentCommandGroup';
import { MapTools } from './MapTools';
import { OverlayCollisionProvider } from './overlay-collision';

export interface MapViewportProps {
  mapProps: MapLibreRootProps;
  commands: CommandRegistry;
  isCleanView: boolean;
  /**
   * Area of the viewport covered by shell chrome. The sidebar floats over the
   * map so the city stays visible while panning, which means the renderer has
   * to be told not to frame the city underneath it.
   */
  mapInset?: { left: number };
  subscribeServiceIconLegendRef: React.RefObject<
    ((callback: (state: ServiceIconLegendState) => void) => () => void) | null
  >;
  iconLegendToggleRef: React.RefObject<(() => void) | null>;
  /** Extra content layered over the map, e.g. the empty state during no-map. */
  children?: React.ReactNode;
}

/**
 * The map region: the renderer plus every overlay that sits on it.
 *
 * @remarks
 * This is the single coordinate space overlays are placed in (AD-5). The
 * viewport owns *where* things go; `MapLibreRoot` owns the map itself —
 * rendering, camera, subscriptions and captures — and no layout logic moved
 * into it, nor renderer logic out of it.
 */
export function MapViewport({
  mapProps,
  commands,
  isCleanView,
  mapInset,
  subscribeServiceIconLegendRef,
  iconLegendToggleRef,
  children,
}: MapViewportProps) {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLElement>(null);
  const portRef = useRef<MapViewportPort | null>(null);
  const cityData = useVellumStore((s) => s.cityData);
  const activeTheme = useVellumStore((s) => s.activeTheme);
  // The minimap paints with Canvas 2D, outside the renderer's theme pipeline,
  // so it reads the active theme's colors here instead of receiving them
  // through `applyTheme`. Only the three it actually paints.
  const minimapPalette = useMemo(() => {
    const style = mapProps.themes?.find((theme) => theme.id === activeTheme);
    return {
      water: style?.water ?? DEFAULT_RENDER_STYLE_PARAMS.water,
      land: style?.terrain.base ?? DEFAULT_RENDER_STYLE_PARAMS.terrain.base,
      highway:
        style?.roads.highway.generic.fill ??
        DEFAULT_RENDER_STYLE_PARAMS.roads.highway.generic.fill,
    };
  }, [mapProps.themes, activeTheme]);
  const [bearing, setBearing] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [tooltipInfo, setTooltipInfo] =
    useState<Parameters<Parameters<MapViewportPort['subscribeHover']>[0]>[0]>(
      null,
    );

  // Stable wrappers over the renderer port. Empty deps on purpose: they read
  // the ref at call time, so overlays never re-subscribe on a parent render.
  const subscribeViewport = useCallback(
    (cb: Parameters<MapViewportPort['subscribeViewport']>[0]) =>
      portRef.current?.subscribeViewport(cb) ?? (() => {}),
    [],
  );
  const getInitialViewportBounds = useCallback(
    () => portRef.current?.getInitialViewportBounds() ?? null,
    [],
  );
  const navigateTo = useCallback((lng: number, lat: number) => {
    portRef.current?.navigateTo(lng, lat);
  }, []);

  // Bearing drives whether Reset north is offered at all. Rotation by drag
  // fires the same viewport events as pan and zoom, so one subscription keeps
  // the control honest however the map was turned.
  useEffect(() => {
    const unsubscribe = subscribeViewport(() => {
      const next = portRef.current?.getBearing();
      if (next !== undefined) setBearing(next);
    });
    return unsubscribe;
  }, [subscribeViewport]);

  useEffect(() => {
    const unsubscribe =
      portRef.current?.subscribeHover((info) => setTooltipInfo(info)) ??
      (() => {});
    return unsubscribe;
  }, []);

  // A load invalidates whatever the pointer was over.
  const loadingState = useVellumStore((s) => s.loadingState);
  useEffect(() => {
    if (loadingState === 'loading') setTooltipInfo(null);
  }, [loadingState]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const showOverlays = cityData !== null && !isCleanView;

  return (
    <main
      ref={viewportRef}
      className="map-surface"
      data-testid="map-surface"
      aria-label={t('a11y.mapViewport')}
    >
      <OverlayCollisionProvider
        viewportRef={viewportRef}
        inset={{ left: mapInset?.left ?? 0 }}
      >
        <div
          data-testid="canvas-wrapper"
          className={cn(
            'absolute inset-0 transition-opacity duration-500',
            cityData ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          <MapLibreRoot
            {...mapProps}
            portRef={portRef}
            {...(mapInset ? { viewportPadding: mapInset } : {})}
          />
        </div>
        {children}
        {showOverlays && (
          <>
            <MapTools>
              <div className="map-tools__document">
                <DocumentCommandGroup commands={commands} />
              </div>
              <div className="map-tools__navigation">
                <CameraControlGroup commands={commands} bearing={bearing} />
                <Minimap
                  cityData={cityData}
                  palette={minimapPalette}
                  subscribeViewport={subscribeViewport}
                  getInitialViewportBounds={getInitialViewportBounds}
                  navigateTo={navigateTo}
                />
              </div>
            </MapTools>
            <IconLegend
              subscribeRef={subscribeServiceIconLegendRef}
              toggleRef={iconLegendToggleRef}
            />
            <MapTooltip
              info={size.width > 0 ? tooltipInfo : null}
              containerWidth={size.width}
              containerHeight={size.height}
            />
          </>
        )}
      </OverlayCollisionProvider>
    </main>
  );
}
