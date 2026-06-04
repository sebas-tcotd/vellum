import { Separator } from '@/lib/separator';
import { cn } from '@/lib/utils';
import type { LayerName } from '@vellum/core';
import { LAYER_NAMES, LayerVisibility } from '@vellum/core';
import {
  Building2,
  Bus,
  LayoutGrid,
  Mountain,
  Route,
  TreePine,
  type LucideIcon,
  Waves,
  ChevronDown,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVellumStore } from '../../store/vellum-store';
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

  const handleCollapse = () => {
    setPanelState('collapsed');
    requestAnimationFrame(() => collapseButtonRef.current?.focus());
  };

  const handleExpand = () => {
    setPanelState('expanded');
    // Story 4.2 Patch: Use a safer focus strategy when expanding
    setTimeout(() => {
      const firstSwitch =
        panelRef.current?.querySelector<HTMLElement>('[role="switch"]');
      firstSwitch?.focus();
    }, 50);
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
        'bg-background/72 border border-[#2c28251f] text-accent-foreground overflow-hidden z-50',
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
          />

          <Separator className="h-px mt-3 mb-2 w-full" />

          <PanelFooter />
          {/* Story 5.x: theme selector pills */}
        </>
      ) : (
        <button
          ref={collapseButtonRef}
          onClick={handleExpand}
          aria-label={t('a11y.layerPanelExpand')}
          className="w-full h-full flex flex-col items-center | bg-transparent border-none cursor-pointer p-0"
        >
          <PanelCollapsedIcons
            activeLayers={activeLayers}
            toggleLayer={toggleLayer}
          />
        </button>
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
        <h3
          className="text-xs font-mono opacity-60 truncate max-w-[140px]"
          title={fileName}
        >
          {fileName}
        </h3>
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
}

function PanelLayerList({ activeLayers, toggleLayer }: PanelLayerListProps) {
  return (
    <div>
      {LAYER_NAMES.map((layer) => {
        const Icon = LAYER_ICONS[layer];
        return (
          <LayerToggleRow
            key={layer}
            layer={layer}
            visible={activeLayers[layer]}
            onToggle={(l, v) => {
              if (v !== activeLayers[l]) toggleLayer(l);
            }}
            color={LAYER_COLORS[layer]}
            icon={<Icon size={14} strokeWidth={1.5} />}
          />
        );
      })}
    </div>
  );
}

function PanelFooter() {
  return (
    <a
      href="#"
      className="font-ui text-xs opacity-50 hover:opacity-80 transition-opacity"
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
            onClick={(e) => {
              e.stopPropagation();
              toggleLayer(layer);
            }}
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
