import { Separator } from '@/lib/separator';
import { Switch } from '@/lib/switch';
import { cn } from '@/lib/utils';
import type { LayerName } from '@vellum/core';
import {
  LAYERS_WITH_ADVANCED_OPTIONS,
  LAYER_NAMES,
  LayerVisibility,
} from '@vellum/core';
import {
  Building2,
  Bus,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Map,
  Mountain,
  Route,
  TreePine,
  type LucideIcon,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVellumStore } from '../../store/vellum-store';
import { AdvancedOptionsPanel } from './AdvancedOptionsPanel';
import { LayerToggleRow } from './LayerToggleRow';

/**
 * Below this window height, the panel stack anchors to the top-left instead
 * of centering vertically — otherwise a tall advanced-options panel eats
 * margin on both the top and bottom edges at once. Chosen with headroom over
 * the tallest realistic stack (main panel + the 2-column transit grid,
 * ~600px), so it only kicks in for genuinely cramped windows.
 */
const SHORT_VIEWPORT_THRESHOLD_PX = 900;

/** Tracks whether `window.innerHeight` is below `threshold`, updating on resize. */
function useIsShortViewport(threshold: number): boolean {
  const [isShort, setIsShort] = useState(() => window.innerHeight < threshold);

  useEffect(() => {
    const handleResize = () => setIsShort(window.innerHeight < threshold);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [threshold]);

  return isShort;
}

/** Visual state of the floating panel. */
export type PanelState = 'expanded' | 'collapsed';

/** Lucide icon component for each map layer. */
const LAYER_ICONS: Record<LayerName, LucideIcon> = {
  terrain: Mountain,
  basemap: Map,
  roads: Route,
  transit: Bus,
  buildings: Building2,
  forests: TreePine,
  districts: LayoutGrid,
};

/** Color hex values per layer (theme: 'day'). Sourced from globals.css design tokens. */
const LAYER_COLORS: Record<LayerName, string> = {
  terrain: '#c4a06a',
  basemap: '#6db8b7',
  roads: '#d2938e',
  transit: '#a098b0',
  buildings: '#c8bfb5',
  forests: '#95ae79',
  districts: '#b4a08c',
};

/** Props for the FloatingLayerPanel component. */
export interface FloatingLayerPanelProps {
  /** City name displayed in the panel header, sourced from CityData.cityName. */
  cityName: string;
  /** File name displayed in the panel header, sourced from CityData.fileName. */
  fileName: string;
}

/**
 * A floating panel that controls the visibility of map layers.
 *
 * @remarks
 * **CRITICAL RULE:** Panel state ('expanded' | 'collapsed') is local UI state — never
 * put it in the Zustand store. The hidden state (Tab key) is out of scope until Story 4.7.
 *
 * @remarks Story 5.x will add the theme selector pills in the panel body.
 */
export const FloatingLayerPanel = ({
  cityName,
  fileName,
}: FloatingLayerPanelProps) => {
  const { t } = useTranslation();
  const [panelState, setPanelState] = useState<PanelState>('expanded');
  const expandedLayer = useVellumStore((s) => s.expandedPanelLayer);
  const setExpandedLayer = useVellumStore((s) => s.setExpandedPanelLayer);
  const isShortViewport = useIsShortViewport(SHORT_VIEWPORT_THRESHOLD_PX);
  const anchorTop = expandedLayer !== null && isShortViewport;
  const panelRef = useRef<HTMLDivElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const activeLayers = useVellumStore((s) => s.activeLayers);
  const toggleLayer = useVellumStore((s) => s.toggleLayer);
  const activeTheme = useVellumStore((s) => s.activeTheme);
  const transitDimmingEnabled = useVellumStore((s) => s.transitDimmingEnabled);
  const panelTheme =
    activeTheme === 'transit' && transitDimmingEnabled ? 'transit' : 'day';

  const handleCollapse = () => {
    setPanelState('collapsed');
    setExpandedLayer(null);
    requestAnimationFrame(() => collapseButtonRef.current?.focus());
  };

  const handleExpand = () => {
    setPanelState('expanded');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const firstSwitch =
          panelRef.current?.querySelector<HTMLElement>('[role="switch"]');
        firstSwitch?.focus();
      });
    });
  };

  return (
    <div
      className={cn(
        'fixed left-4 flex flex-col gap-2 z-50',
        'transition-[top,transform] duration-300 ease-in-out',
        anchorTop ? 'top-4' : 'top-1/2 -translate-y-1/2',
      )}
    >
      <div
        ref={panelRef}
        data-state={panelState}
        aria-expanded={panelState === 'expanded'}
        aria-label={t('a11y.layerPanel')}
        role="region"
        className={cn(
          'backdrop-blur-lg rounded-lg',
          'bg-background/72 border border-panel-border text-accent-foreground overflow-hidden',
          'px-3 py-2',
          'shadow-lg',
          '[transition:width_var(--transition-panel)]',
          panelState === 'expanded' ? 'w-52' : 'w-12',
        )}
      >
        {panelState === 'expanded' ? (
          <>
            <PanelHeader
              cityName={cityName}
              fileName={fileName}
              collapseButtonRef={collapseButtonRef}
              handleCollapse={handleCollapse}
            />

            <Separator className="h-px my-3 w-full" />

            <PanelLayerList
              activeLayers={activeLayers}
              toggleLayer={toggleLayer}
              theme={panelTheme}
              expandedLayer={expandedLayer}
              onToggleExpanded={(layer) =>
                setExpandedLayer(expandedLayer === layer ? null : layer)
              }
            />

            <Separator className="h-px mt-3 mb-2 w-full" />

            <PanelThemeSelector />

            <Separator className="h-px mt-3 mb-2 w-full" />

            <PanelFooter />
          </>
        ) : (
          <div className="flex flex-col items-center py-1 gap-1">
            <button
              ref={collapseButtonRef}
              onClick={handleExpand}
              aria-label={t('a11y.layerPanelExpand')}
              className="w-6 h-6 flex items-center justify-center rounded opacity-60 hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer p-0"
            >
              <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <PanelCollapsedIcons
              activeLayers={activeLayers}
              toggleLayer={toggleLayer}
              theme={panelTheme}
            />
          </div>
        )}
      </div>

      {panelState === 'expanded' && expandedLayer && (
        <AdvancedOptionsFloatingPanel
          layer={expandedLayer}
          onClose={() => setExpandedLayer(null)}
        />
      )}
    </div>
  );
};

interface PanelHeaderProps extends FloatingLayerPanelProps {
  collapseButtonRef: React.RefObject<HTMLButtonElement | null>;
  handleCollapse: () => void;
}

function PanelHeader({
  cityName,
  fileName,
  collapseButtonRef,
  handleCollapse,
}: PanelHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between">
      <div className="font-wordmark leading-tight">
        <h1 className="text-lg font-medium opacity-90">{cityName}</h1>
        <h2
          className="text-xs font-mono opacity-70 truncate max-w-[140px]"
          title={fileName}
        >
          {fileName}
        </h2>
      </div>
      <button
        ref={collapseButtonRef}
        onClick={handleCollapse}
        aria-label={t('a11y.layerPanelCollapse')}
        className={cn([
          'flex items-center justify-center rounded opacity-60 hover:opacity-100 transition-opacity min-w-6 min-h-6',
          'hover:rotate-90 transition',
        ])}
      >
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}

interface PanelLayerListProps {
  activeLayers: LayerVisibility;
  toggleLayer: (layer: LayerName) => void;
  theme: 'day' | 'transit';
  expandedLayer: LayerName | null;
  onToggleExpanded: (layer: LayerName) => void;
}

function PanelLayerList({
  activeLayers,
  toggleLayer,
  theme,
  expandedLayer,
  onToggleExpanded,
}: PanelLayerListProps) {
  return (
    <div>
      {LAYER_NAMES.map((layer) => {
        const Icon = LAYER_ICONS[layer];
        const hasAdvancedOptions = LAYERS_WITH_ADVANCED_OPTIONS.has(layer);
        return (
          <LayerToggleRow
            key={layer}
            layer={layer}
            visible={activeLayers[layer]}
            onToggle={(l, v) => {
              if (v !== activeLayers[l]) toggleLayer(l);
            }}
            theme={theme}
            color={LAYER_COLORS[layer]}
            icon={<Icon size={14} strokeWidth={1.5} />}
            hasAdvancedOptions={hasAdvancedOptions}
            expanded={expandedLayer === layer}
            onToggleExpanded={() => onToggleExpanded(layer)}
          />
        );
      })}
    </div>
  );
}

/** Props for {@link AdvancedOptionsFloatingPanel}. */
interface AdvancedOptionsFloatingPanelProps {
  layer: LayerName;
  onClose: () => void;
}

/**
 * Separate floating panel hosting a layer's advanced options — rendered as a
 * sibling below {@link FloatingLayerPanel}'s main box, inside the same flex
 * column wrapper. That wrapper stays vertically centered while this panel is
 * closed, and switches to anchored-at-top only when it's open *and* the
 * window is short (`useIsShortViewport`) — so a tall stack only eats margin
 * on one edge instead of both, without permanently un-centering the panel on
 * large windows where there's no need to.
 *
 * @remarks
 * Width is shrink-to-fit (`w-fit`) between `min-w-52` (never narrower than
 * the main panel) and `max-w-[26rem]` — the transit-mode grid (2 columns,
 * see `AdvancedOptionsPanel.tsx`) grows the panel horizontally instead of
 * vertically. `overflow-x-auto` is a safety net if content ever exceeds the
 * max width; nothing today is expected to trigger it.
 */
function AdvancedOptionsFloatingPanel({
  layer,
  onClose,
}: AdvancedOptionsFloatingPanelProps) {
  const { t } = useTranslation();
  const layerOptions = useVellumStore((s) => s.layerOptions);
  const toggleTransitMode = useVellumStore((s) => s.toggleTransitMode);
  const toggleBuildingCategory = useVellumStore(
    (s) => s.toggleBuildingCategory,
  );
  const setBuildingColorByCategory = useVellumStore(
    (s) => s.setBuildingColorByCategory,
  );
  const setDistrictsShowNameOnMap = useVellumStore(
    (s) => s.setDistrictsShowNameOnMap,
  );
  const setTerrainShowContourLines = useVellumStore(
    (s) => s.setTerrainShowContourLines,
  );
  const setTerrainShowColorRelief = useVellumStore(
    (s) => s.setTerrainShowColorRelief,
  );
  const setTerrainShowHillshade = useVellumStore(
    (s) => s.setTerrainShowHillshade,
  );
  const setBasemapShowGrid = useVellumStore((s) => s.setBasemapShowGrid);
  const layerName = t(`layers.${layer}`);

  return (
    <div
      role="region"
      aria-label={t('a11y.advancedOptions', { layer: layerName })}
      className="backdrop-blur-lg rounded-lg bg-background/72 border border-panel-border text-accent-foreground shadow-lg px-3 py-2 min-w-52 w-fit max-w-[26rem] overflow-x-auto"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-wordmark text-sm font-medium opacity-90 truncate">
          {layerName}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('layerOptionsPanel.close')}
          className="flex items-center justify-center rounded opacity-60 hover:opacity-100 transition-opacity min-w-6 min-h-6 bg-transparent border-none cursor-pointer p-0"
        >
          <X size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <Separator className="h-px my-2 w-full" />

      <AdvancedOptionsPanel
        layer={layer}
        visibleModes={layerOptions.transit.visibleModes}
        onToggleMode={toggleTransitMode}
        visibleCategories={layerOptions.buildings.visibleCategories}
        onToggleCategory={toggleBuildingCategory}
        colorByCategory={layerOptions.buildings.colorByCategory}
        onToggleColorByCategory={setBuildingColorByCategory}
        showDistrictNamesOnMap={layerOptions.districts.showNameOnMap}
        onToggleShowDistrictNamesOnMap={setDistrictsShowNameOnMap}
        showContourLines={layerOptions.terrain.showContourLines}
        onToggleContourLines={setTerrainShowContourLines}
        showColorRelief={layerOptions.terrain.showColorRelief}
        onToggleColorRelief={setTerrainShowColorRelief}
        showHillshade={layerOptions.terrain.showHillshade}
        onToggleHillshade={setTerrainShowHillshade}
        showGrid={layerOptions.basemap.showGrid}
        onToggleShowGrid={setBasemapShowGrid}
      />
    </div>
  );
}

/**
 * Theme selector rendered as a row of pills (per `ux-design-specification.md`: pills, not a dropdown).
 * @remarks
 * Sources pills from `store.availableThemes` (populated by `useThemes` at startup). Clicking a pill
 * sets `activeTheme`; the renderer host (`MapLibreRoot`) applies the matching `RenderStyleParams`.
 */
function PanelThemeSelector() {
  const { t } = useTranslation();
  const availableThemes = useVellumStore((s) => s.availableThemes);
  const activeTheme = useVellumStore((s) => s.activeTheme);
  const setActiveTheme = useVellumStore((s) => s.setActiveTheme);
  const transitDimmingEnabled = useVellumStore((s) => s.transitDimmingEnabled);
  const setTransitDimmingEnabled = useVellumStore(
    (s) => s.setTransitDimmingEnabled,
  );

  if (availableThemes.length === 0) return null;

  return (
    <>
      <div
        role="group"
        aria-label={t('a11y.themeSelector')}
        className="flex flex-wrap gap-1.5 mt-1"
      >
        {availableThemes.map((theme) => {
          const active = theme.id === activeTheme;
          return (
            <button
              key={theme.id}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveTheme(theme.id)}
              className={cn(
                'font-ui text-xs rounded-full px-2.5 py-1 border transition-colors cursor-pointer',
                active
                  ? 'bg-accent-foreground/90 text-background border-transparent'
                  : 'bg-transparent border-panel-border opacity-70 hover:opacity-100',
              )}
            >
              {theme.name}
            </button>
          );
        })}
      </div>
      {activeTheme === 'transit' && (
        <div
          className="flex items-center gap-2 px-1 mt-2"
          style={{ minHeight: 28 }}
        >
          <span className="font-ui flex-1 text-xs truncate opacity-80">
            {t('themes.dimNonTransit')}
          </span>
          <Switch
            checked={transitDimmingEnabled}
            onCheckedChange={setTransitDimmingEnabled}
            aria-label={t('themes.dimNonTransit')}
          />
        </div>
      )}
    </>
  );
}

function PanelFooter() {
  return (
    <a
      href="#"
      className="font-ui text-xs opacity-70 hover:opacity-100 transition-opacity"
    >
      Cartógrafos de CS1 →
    </a>
  );
}

type PanelCollapsedIconsProps = Pick<
  PanelLayerListProps,
  'activeLayers' | 'toggleLayer' | 'theme'
>;

function PanelCollapsedIcons({
  activeLayers,
  toggleLayer,
}: PanelCollapsedIconsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center py-2 gap-1">
      {LAYER_NAMES.map((layer) => {
        const Icon = LAYER_ICONS[layer];
        return (
          <button
            key={layer}
            onClick={() => toggleLayer(layer)}
            aria-label={t(`layers.${layer}`)}
            aria-pressed={activeLayers[layer]}
            className="flex items-center justify-center rounded min-w-6 min-h-6 bg-transparent border-none cursor-pointer p-0 transition"
            style={{
              color: LAYER_COLORS[layer],
              opacity: activeLayers[layer] ? 1 : 0.3,
            }}
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
