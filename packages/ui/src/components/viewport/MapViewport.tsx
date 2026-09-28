import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Crosshair, Network } from 'lucide-react';
import type { MapSelectHit, ServiceIconLegendState } from '@vellum/core';
import type {
  MapLibreRootProps,
  MapViewportPort,
} from '../canvas/MapLibreRoot';
import { MapLibreRoot } from '../canvas/MapLibreRoot';
import { Minimap } from '../minimap/Minimap';
import { MapTooltip } from '../overlays/MapTooltip';
import { IconLegend } from '../panels/IconLegend';
import { SchematicView } from '../schematic/SchematicView';
import {
  EMPTY_SCHEMATIC_MODEL,
  type SchematicNetworkModel,
} from '../../hooks/use-schematic-network';
import type { CommandRegistry } from '../../shell/commands';
import {
  MAP_FOCUS_ID,
  type ShellSession,
  type ViewMode,
} from '../../shell/shell-session';
import { PlaceCard, type PlaceCardData } from '../place-card/PlaceCard';
import {
  buildPlaceCard,
  isNotableBuilding,
  placeAnchor,
} from '../place-card/place-card-model';
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
  /**
   * Chrome the *schematic* diagram has to keep clear of. Deliberately separate
   * from {@link mapInset}: the geographic padding is renderer state MapLibre is
   * subscribed to, so resizing the schematic sidebar must not reframe a map
   * nobody is looking at.
   */
  schematicInset?: {
    left: number;
    top?: number;
    right?: number;
    bottom?: number;
  };
  /** The shared model the schematic sidebar reads; see `useSchematicNetwork`. */
  schematicModel?: SchematicNetworkModel;
  /** Legend row the pointer is over; holds every other stroke back. */
  hoveredSchematicLineId?: string | null;
  /** Brings every switched-off schematic mode back. */
  onShowAllSchematicModes?: () => void;
  subscribeServiceIconLegendRef: React.RefObject<
    ((callback: (state: ServiceIconLegendState) => void) => () => void) | null
  >;
  iconLegendToggleRef: React.RefObject<(() => void) | null>;
  /**
   * The shell session, for the place card: which place is pinned, and the
   * actions that pin and clear it. Without it the map has no place card.
   */
  shell?: ShellSession;
  /** Extra content layered over the map, e.g. the empty state during no-map. */
  children?: React.ReactNode;
}

/** Distance the card keeps from the viewport edges, mirroring `--shell-overlay-inset`. */
const CARD_EDGE_INSET = 12;
/** Room left between the card and a place the map is panned to reveal. */
const CARD_PAN_MARGIN = 24;

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
  schematicInset,
  schematicModel = EMPTY_SCHEMATIC_MODEL,
  hoveredSchematicLineId = null,
  onShowAllSchematicModes,
  subscribeServiceIconLegendRef,
  iconLegendToggleRef,
  shell,
  children,
}: MapViewportProps) {
  const { t, i18n } = useTranslation();
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

  // ─── Place card (Story 3.6) ────────────────────────────────────────────
  const pinned = shell?.state.pinnedEntity ?? null;
  const restoreFocus = shell?.state.restoreFocus ?? null;
  const shellDispatch = shell?.dispatch;
  const cardRef = useRef<HTMLElement>(null);
  /** Where the latest selecting click landed, for the minimal pan. */
  const clickPointRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * Bumped on every selecting click — re-clicking the place already pinned
   * included — so the pan is re-evaluated even when the selection is unchanged.
   */
  const [selectSeq, setSelectSeq] = useState(0);
  /** Whether focus was inside the card when it went away. */
  const cardHadFocusRef = useRef(false);
  const buildingsById = useMemo(
    () => new Map((cityData?.buildings ?? []).map((b) => [b.id, b])),
    [cityData],
  );
  const districtIds = useMemo(
    () => new Set((cityData?.districts ?? []).map((d) => d.id)),
    [cityData],
  );
  const parkIds = useMemo(
    () => new Set((cityData?.parkAreas ?? []).map((p) => p.id)),
    [cityData],
  );

  // One click event; the viewport arbitrates, because only `CityData` knows
  // whether a building is notable. The first notable building in the hit
  // (nearest first), then the park area (it sits inside a district), then the
  // district, else the click clears the card.
  const selectRef = useRef<(hit: MapSelectHit) => void>(() => {});
  selectRef.current = (hit) => {
    if (!shellDispatch) return;
    const building = (hit.buildingIds ?? [])
      .map((id) => buildingsById.get(id))
      .find((b) => b !== undefined && isNotableBuilding(b));
    const entity = building
      ? ({ kind: 'building', id: building.id } as const)
      : hit.parkId !== undefined && parkIds.has(hit.parkId)
        ? ({ kind: 'park', id: hit.parkId } as const)
        : hit.districtId !== undefined && districtIds.has(hit.districtId)
          ? ({ kind: 'district', id: hit.districtId } as const)
          : null;
    if (entity === null) {
      clickPointRef.current = null;
      shellDispatch({ type: 'place/clear' });
      return;
    }
    clickPointRef.current = { x: hit.screenX, y: hit.screenY };
    shellDispatch({ type: 'place/select', entity });
    setSelectSeq((n) => n + 1);
  };
  useEffect(() => {
    const unsubscribe =
      portRef.current?.subscribeSelect((hit) => selectRef.current(hit)) ??
      (() => {});
    return unsubscribe;
  }, []);

  // The tint follows the pinned district, and nothing else.
  const tintedDistrict = pinned?.kind === 'district' ? pinned.id : null;
  useEffect(() => {
    portRef.current?.setSelectedDistrict(tintedDistrict);
  }, [tintedDistrict]);

  // Hiding the place's layer, or starting another load, invalidates the card.
  const activeLayers = useVellumStore((s) => s.activeLayers);
  const showParkAreas = useVellumStore(
    (s) => s.layerOptions.districts.showParkAreas,
  );
  const pinnedLayerHidden =
    (pinned?.kind === 'district' && !activeLayers.districts) ||
    (pinned?.kind === 'park' && !(activeLayers.districts && showParkAreas)) ||
    (pinned?.kind === 'building' && !activeLayers.buildings);
  useEffect(() => {
    if (pinnedLayerHidden || loadingState === 'loading') {
      shellDispatch?.({ type: 'place/clear' });
    }
  }, [pinnedLayerHidden, loadingState, shellDispatch]);

  const closeCard = useCallback(
    () => shellDispatch?.({ type: 'place/clear', returnFocus: true }),
    [shellDispatch],
  );
  const handleCardUnmount = useCallback((hadFocus: boolean) => {
    cardHadFocusRef.current = hadFocus;
  }, []);

  // Optional: test doubles of `useTranslation` often leave `i18n` out.
  const language = (i18n as typeof i18n | undefined)?.language;
  const cardData = useMemo<PlaceCardData | null>(() => {
    const data = buildPlaceCard(cityData, pinned, t, language);
    if (!data || !cityData || !pinned) return null;
    const anchor = placeAnchor(cityData, pinned);
    return {
      ...data,
      actions: [
        ...(anchor
          ? [
              {
                id: 'center',
                label: t('placeCard.centerOnMap'),
                icon: Crosshair,
                onSelect: () => portRef.current?.navigateTo(...anchor),
              },
            ]
          : []),
        {
          id: 'copy',
          label: t('placeCard.copyName'),
          icon: Copy,
          onSelect: () => {
            void navigator.clipboard?.writeText(data.title).catch(() => {});
          },
        },
      ],
    };
  }, [cityData, pinned, t, language]);

  const isSchematic = viewMode === 'schematic' && cityData !== null;
  const showPlaceCard = cardData !== null && !isSchematic;
  const cardLeft = CARD_EDGE_INSET + (mapInset?.left ?? 0);

  // Closed from the keyboard or its button: focus goes back to the map — but
  // only if it was in the card or on the map. Focus the user has put in the
  // sidebar or the toolbar is theirs, and is never taken away.
  const wasCardShown = useRef(showPlaceCard);
  useEffect(() => {
    const closed = wasCardShown.current && !showPlaceCard;
    wasCardShown.current = showPlaceCard;
    const requested = restoreFocus === MAP_FOCUS_ID;
    if (closed || requested) {
      const hadFocus = cardHadFocusRef.current;
      cardHadFocusRef.current = false;
      const active = document.activeElement;
      const mapWrapper = viewportRef.current?.querySelector(
        '[data-testid="canvas-wrapper"]',
      );
      const onMap =
        active === null ||
        active === document.body ||
        (mapWrapper?.contains(active) ?? false);
      if (closed && pinned === null && (hadFocus || (requested && onMap))) {
        mapWrapper?.querySelector<HTMLElement>('canvas')?.focus();
      }
    }
    if (requested && pinned === null) {
      shellDispatch?.({ type: 'focus/consume' });
    }
  }, [showPlaceCard, restoreFocus, pinned, shellDispatch]);

  // The minimal nudge: if the card covers the point that was clicked, pan
  // horizontally just enough (plus a margin) to bring it back into view —
  // never so far that the point would leave the viewport on the right.
  useEffect(() => {
    const point = clickPointRef.current;
    clickPointRef.current = null;
    const card = cardRef.current;
    const viewport = viewportRef.current;
    if (!showPlaceCard || !point || !card || !viewport) return;
    const origin = viewport.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const right = box.right - origin.left;
    const top = box.top - origin.top;
    const bottom = box.bottom - origin.top;
    const covered =
      point.x < right + CARD_PAN_MARGIN &&
      point.y >= top - CARD_PAN_MARGIN &&
      point.y <= bottom + CARD_PAN_MARGIN;
    if (!covered) return;
    const target = Math.min(
      right + CARD_PAN_MARGIN,
      origin.width - CARD_EDGE_INSET,
    );
    const dx = point.x - target;
    if (dx < 0) portRef.current?.panBy(dx, 0);
  }, [selectSeq, showPlaceCard]);
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
              paddingTop: schematicInset?.top ?? 0,
              paddingRight: schematicInset?.right ?? 0,
              paddingBottom: schematicInset?.bottom ?? 0,
              paddingLeft: schematicInset?.left ?? 0,
            }}
          >
            <div className="relative h-full w-full">
              <SchematicView
                ref={schematicRegionRef}
                model={schematicModel}
                hoveredLineId={hoveredSchematicLineId}
                onBack={() => schematicCommand.execute()}
                onShowAllModes={() => onShowAllSchematicModes?.()}
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
        {showPlaceCard && (
          <PlaceCard
            ref={cardRef}
            data={cardData}
            onClose={closeCard}
            onUnmount={handleCardUnmount}
            style={{ left: cardLeft }}
          />
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
