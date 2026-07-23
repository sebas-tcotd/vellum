import { Separator } from '@/lib/separator';
import { Switch } from '@/lib/switch';
import { cn } from '@/lib/utils';
import type { LayerName } from '@vellum/core';
import { LAYER_NAMES, LayerVisibility } from '@vellum/core';
import {
  Building2,
  Bus,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Mountain,
  Route,
  TreePine,
  type LucideIcon,
  Waves,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVellumStore } from '../../store/vellum-store';
import { AdvancedOptionsPanel } from './AdvancedOptionsPanel';
import { LayerToggleRow } from './LayerToggleRow';

/** Visual state of the floating panel. */
export type PanelState = 'expanded' | 'collapsed';

/** Lucide icon component for each map layer. */
const LAYER_ICONS: Record<LayerName, LucideIcon> = {
  terrain: Mountain,
  water: Waves,
  roads: Route,
  transit: Bus,
  buildings: Building2,
  forests: TreePine,
  districts: LayoutGrid,
};

/** Color hex values per layer (theme: 'day'). Sourced from globals.css design tokens. */
const LAYER_COLORS: Record<LayerName, string> = {
  terrain: '#c4a06a',
  water: '#6db8b7',
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
      ref={panelRef}
      data-state={panelState}
      aria-expanded={panelState === 'expanded'}
      aria-label={t('a11y.layerPanel')}
      role="region"
      className={cn(
        'fixed left-4 top-1/2 -translate-y-1/2 backdrop-blur-lg rounded-lg',
        'bg-background/72 border border-panel-border text-accent-foreground overflow-hidden z-50',
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
}

/** Layers that have an advanced-options sub-panel (transit-mode filter, buildings RICO filter). */
const LAYERS_WITH_ADVANCED_OPTIONS = new Set<LayerName>([
  'transit',
  'buildings',
]);

function PanelLayerList({
  activeLayers,
  toggleLayer,
  theme,
}: PanelLayerListProps) {
  const [expandedLayer, setExpandedLayer] = useState<LayerName | null>(null);
  const layerOptions = useVellumStore((s) => s.layerOptions);
  const toggleTransitMode = useVellumStore((s) => s.toggleTransitMode);
  const toggleBuildingCategory = useVellumStore(
    (s) => s.toggleBuildingCategory,
  );

  return (
    <div>
      {LAYER_NAMES.map((layer) => {
        const Icon = LAYER_ICONS[layer];
        const hasAdvancedOptions = LAYERS_WITH_ADVANCED_OPTIONS.has(layer);
        const expanded = expandedLayer === layer;
        return (
          <div key={layer}>
            <LayerToggleRow
              layer={layer}
              visible={activeLayers[layer]}
              onToggle={(l, v) => {
                if (v !== activeLayers[l]) toggleLayer(l);
              }}
              theme={theme}
              color={LAYER_COLORS[layer]}
              icon={<Icon size={14} strokeWidth={1.5} />}
              hasAdvancedOptions={hasAdvancedOptions}
              expanded={expanded}
              onToggleExpanded={() => setExpandedLayer(expanded ? null : layer)}
            />
            {expanded && (
              <AdvancedOptionsPanel
                layer={layer}
                visibleModes={layerOptions.transit.visibleModes}
                onToggleMode={toggleTransitMode}
                visibleCategories={layerOptions.buildings.visibleCategories}
                onToggleCategory={toggleBuildingCategory}
              />
            )}
          </div>
        );
      })}
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

type PanelCollapsedIconsProps = PanelLayerListProps;

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
