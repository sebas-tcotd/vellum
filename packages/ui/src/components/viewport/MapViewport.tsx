import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Network } from 'lucide-react';
import type { ServiceIconLegendState } from '@vellum/core';
import type {
  MapLibreRootProps,
  MapViewportPort,
} from '../canvas/MapLibreRoot';
import { MapLibreRoot } from '../canvas/MapLibreRoot';
import { Minimap } from '../minimap/Minimap';
import { MapTooltip } from '../overlays/MapTooltip';
import { IconLegend } from '../panels/IconLegend';
import { SchematicView } from '../schematic/SchematicView';
import type { CommandRegistry } from '../../shell/commands';
import type { ViewMode } from '../../shell/shell-session';
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
   * Geographic map or schematic surface. In `schematic` the map stays mounted
   * (hidden, not unmounted) so returning keeps camera, theme and layers.
   */
  viewMode?: ViewMode;
  /**
   * Area of the viewport covered by shell chrome. The sidebar floats over the
   * map so the city stays visible while panning, which means the renderer has
   * to be told not to frame the city underneath it.
   */
  mapInset?: { left: number; top?: number; right?: number; bottom?: number };
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
  viewMode = 'geographic',
  mapInset,
  subscribeServiceIconLegendRef,
  iconLegendToggleRef,
  children,
}: MapViewportProps) {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLElement>(null);
  const portRef = useRef<MapViewportPort | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const schematicRegionRef = useRef<HTMLElement>(null);
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

  const isSchematic = viewMode === 'schematic' && cityData !== null;
  // In schematic mode the toggle is the on-screen way back, so it survives
  // Clean view; the geographic overlays never show there.
  const showTools = cityData !== null && (!isCleanView || isSchematic);
  const showOverlays = cityData !== null && !isCleanView && !isSchematic;
  const schematicCommand = commands['view.schematic'];

  // Focus follows the switch: into the schematic region on entry, back to the
  // toggle on exit, so it never stays on the inert map wrapper.
  const wasSchematic = useRef(isSchematic);
  useEffect(() => {
    if (wasSchematic.current === isSchematic) return;
    wasSchematic.current = isSchematic;
    if (isSchematic) schematicRegionRef.current?.focus();
    else toggleRef.current?.focus();
  }, [isSchematic]);
  const schematicLabel = isSchematic
    ? t('schematic.back')
    : t('schematic.open');

  // The one readiness signal the map region publishes to the outside world.
  // `canvas-wrapper`'s opacity already tracks `cityData`, but opacity is a
  // presentation detail an automated check cannot read as a state machine, and
  // it collapses "nothing opened yet" and "opening right now" into the same
  // transparent frame. `loading` wins over a still-present `cityData` because
  // a second load leaves the previous city on screen while the new one parses:
  // reporting `ready` there would let a driver act on a map that is about to
  // be replaced. Nothing else derives from this — it is read, never rendered.
  const mapState =
    loadingState === 'loading'
      ? 'loading'
      : cityData !== null
        ? 'ready'
        : 'empty';

  return (
    <main
      ref={viewportRef}
      className="map-surface"
      data-testid="map-surface"
      data-map-state={mapState}
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
          // Hidden, never unmounted: `visibility` keeps MapLibre's measured size
          // so no `resize()` is needed on the way back (Story 4.1).
          {...(isSchematic
            ? {
                style: { visibility: 'hidden' as const },
                'aria-hidden': true,
                inert: true,
              }
            : {})}
        >
          <MapLibreRoot
            {...mapProps}
            portRef={portRef}
            {...(mapInset ? { viewportPadding: { left: mapInset.left } } : {})}
          />
        </div>
        {isSchematic && cityData !== null && (
          <div
            className="absolute inset-0"
            style={{
              paddingTop: mapInset?.top ?? 0,
              paddingRight: mapInset?.right ?? 0,
              paddingBottom: mapInset?.bottom ?? 0,
              paddingLeft: mapInset?.left ?? 0,
            }}
          >
            <div className="relative h-full w-full">
              <SchematicView
                ref={schematicRegionRef}
                cityData={cityData}
                onBack={() => schematicCommand.execute()}
              />
            </div>
          </div>
        )}
        {children}
        {showTools && (
          <MapTools>
            <div className="map-tools__document">
              {!(isSchematic && isCleanView) && (
                <DocumentCommandGroup commands={commands} />
              )}
              <div
                className="shell-floating-group"
                role="group"
                aria-label={t('schematic.viewSwitch')}
              >
                <button
                  type="button"
                  className="shell-floating-button"
                  data-testid="schematic-toggle"
                  data-focus-id="view-schematic"
                  ref={toggleRef}
                  aria-label={schematicLabel}
                  aria-pressed={isSchematic}
                  title={schematicLabel}
                  disabled={!schematicCommand.canExecute}
                  onClick={() => schematicCommand.execute()}
                >
                  <Network size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
            </div>
            {showOverlays && (
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
            )}
          </MapTools>
        )}
        {showOverlays && (
          <>
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
