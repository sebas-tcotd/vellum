import { Separator } from '../../lib/separator';
import { Switch } from '../../lib/switch';
import type {
  BuildingServiceCategory,
  CitySource,
  LayerName,
  TransitMode,
} from '@vellum/core';
import { PUBLIC_TRANSPORT_MODES, TOUR_TRANSIT_MODES } from '@vellum/core';
import { useTranslation } from 'react-i18next';

/** The 4 zoning categories CSLMapView's "Ocultar Edificios R/I/C/O" option exposes.
 * `civic` and `none` (services, landmarks) are intentionally not togglable here,
 * matching that reference feature — they stay always visible. */
const RICO_CATEGORIES = [
  'residential',
  'industry',
  'commercial',
  'office',
] as const satisfies readonly BuildingServiceCategory[];

/** Props for a single advanced-option toggle row. */
interface OptionRowProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function OptionRow({ label, checked, onCheckedChange }: OptionRowProps) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
      <span className="font-ui min-w-0 text-xs leading-4 opacity-80 [overflow-wrap:anywhere]">
        {label}
      </span>
      <Switch
        className="shrink-0"
        aria-label={label}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/** Props for {@link AdvancedOptionsPanel}. */
export interface AdvancedOptionsPanelProps {
  /** Which layer's options to render — only `'transit'`, `'buildings'`, `'districts'`, and `'terrain'` have any. */
  layer: LayerName;
  showForestCircles: boolean;
  onToggleForestCircles: (enabled: boolean) => void;
  showForestHeatmap: boolean;
  onToggleForestHeatmap: (enabled: boolean) => void;
  visibleModes: TransitMode[];
  onToggleMode: (mode: TransitMode) => void;
  /** Whether the confirmed-transfer marker is visible. */
  showConfirmedTransfers: boolean;
  onToggleShowConfirmedTransfers: (enabled: boolean) => void;
  visibleCategories: BuildingServiceCategory[];
  onToggleCategory: (category: BuildingServiceCategory) => void;
  /** Whether R/I/C/O buildings render in fixed RICO colors instead of the theme default. */
  colorByCategory: boolean;
  onToggleColorByCategory: (enabled: boolean) => void;
  /** Whether districts render as a marker circle instead of the default name label. */
  showDistrictsAsMarkers: boolean;
  onToggleShowDistrictsAsMarkers: (enabled: boolean) => void;
  /** Whether district areas get a light tint (native documents only). */
  showDistrictFill: boolean;
  colorDistrictsBySpecialization?: boolean;
  onToggleDistrictsColorBySpecialization?: (enabled: boolean) => void;
  onToggleShowDistrictFill: (enabled: boolean) => void;
  /** Format of the open document; the fill needs areas only `.vellummap` has. */
  source?: CitySource | undefined;
  /** Whether DLC park areas are rendered as labeled points. */
  showParkAreas: boolean;
  onToggleShowParkAreas: (enabled: boolean) => void;
  /** Whether terrain contour lines are visible. */
  showContourLines: boolean;
  onToggleContourLines: (enabled: boolean) => void;
  /** Whether the terrain colour-relief hypsometric ramp is visible. */
  showColorRelief: boolean;
  onToggleColorRelief: (enabled: boolean) => void;
  /** Whether the terrain hillshade shading is visible. */
  showHillshade: boolean;
  onToggleHillshade: (enabled: boolean) => void;
  /** Whether the basemap 9×9 projection grid is visible. */
  showGrid: boolean;
  onToggleShowGrid: (enabled: boolean) => void;
  /** Whether street names are drawn along the roads. */
  showStreetNames: boolean;
  showRailways: boolean;
  onToggleShowRailways: (enabled: boolean) => void;
  showFlights: boolean;
  onToggleShowFlights: (enabled: boolean) => void;
  showFerries: boolean;
  onToggleShowFerries: (enabled: boolean) => void;

  onToggleShowStreetNames: (enabled: boolean) => void;
}

/**
 * Content of the advanced-options floating panel (see `FloatingLayerPanel.tsx`
 * for the panel chrome). Renders terrain sub-element toggles, the transit-mode
 * filter, the buildings' RICO filter + "color by category" toggle, the
 * district label toggle, or the street-names toggle, depending on `layer`.
 */
export function AdvancedOptionsPanel({
  layer,
  showForestCircles,
  onToggleForestCircles,
  showForestHeatmap,
  onToggleForestHeatmap,
  visibleModes,
  onToggleMode,
  showConfirmedTransfers,
  onToggleShowConfirmedTransfers,
  visibleCategories,
  onToggleCategory,
  colorByCategory,
  onToggleColorByCategory,
  showDistrictsAsMarkers,
  onToggleShowDistrictsAsMarkers,
  showDistrictFill,
  colorDistrictsBySpecialization = false,
  onToggleDistrictsColorBySpecialization,
  onToggleShowDistrictFill,
  source,
  showParkAreas,
  onToggleShowParkAreas,
  showContourLines,
  onToggleContourLines,
  showColorRelief,
  onToggleColorRelief,
  showHillshade,
  onToggleHillshade,
  showGrid,
  onToggleShowGrid,
  showStreetNames,
  showRailways,
  onToggleShowRailways,
  showFlights,
  onToggleShowFlights,
  showFerries,
  onToggleShowFerries,

  onToggleShowStreetNames,
}: AdvancedOptionsPanelProps) {
  const { t } = useTranslation();

  if (layer === 'forests') {
    return (
      <div>
        <OptionRow
          label={t('layerOptionsPanel.showForestCircles')}
          checked={showForestCircles}
          onCheckedChange={onToggleForestCircles}
        />
        <OptionRow
          label={t('layerOptionsPanel.showForestHeatmap')}
          checked={showForestHeatmap}
          onCheckedChange={onToggleForestHeatmap}
        />
        {!showForestCircles && !showForestHeatmap && (
          <p className="px-3 py-2 text-xs opacity-80" role="status">
            {t('layerOptionsPanel.noVegetation')}
          </p>
        )}
      </div>
    );
  }

  if (layer === 'transit') {
    return (
      <div className="min-w-0">
        {PUBLIC_TRANSPORT_MODES.map((mode) => (
          <OptionRow
            key={mode}
            label={t(`transitModes.${mode}`)}
            checked={visibleModes.includes(mode)}
            onCheckedChange={() => onToggleMode(mode)}
          />
        ))}
        <Separator className="h-px my-1 w-full" />
        <h3 className="shell-section__subheading">
          {t('layerOptionsPanel.tours')}
        </h3>
        {TOUR_TRANSIT_MODES.map((mode) => (
          <OptionRow
            key={mode}
            label={t(`transitModes.${mode}`)}
            checked={visibleModes.includes(mode)}
            onCheckedChange={() => onToggleMode(mode)}
          />
        ))}
        <Separator className="h-px my-1 w-full" />
        <OptionRow
          label={t('layerOptionsPanel.showConfirmedTransfers')}
          checked={showConfirmedTransfers}
          onCheckedChange={onToggleShowConfirmedTransfers}
        />
      </div>
    );
  }

  if (layer === 'buildings') {
    return (
      <div>
        <OptionRow
          label={t('layerOptionsPanel.colorByCategory')}
          checked={colorByCategory}
          onCheckedChange={onToggleColorByCategory}
        />
        <Separator className="h-px my-1 w-full" />
        {/* The community term stays, grouped under a label that also explains
            it to someone meeting RICO for the first time. */}
        <h3 className="shell-section__subheading">
          {t('layerOptionsPanel.buildingZones')}
        </h3>
        {RICO_CATEGORIES.map((category) => (
          <OptionRow
            key={category}
            label={t(`buildingCategories.${category}`)}
            checked={visibleCategories.includes(category)}
            onCheckedChange={() => onToggleCategory(category)}
          />
        ))}
      </div>
    );
  }

  if (layer === 'terrain') {
    return (
      <div>
        <OptionRow
          label={t('layerOptionsPanel.showContourLines')}
          checked={showContourLines}
          onCheckedChange={onToggleContourLines}
        />
        <OptionRow
          label={t('layerOptionsPanel.showColorRelief')}
          checked={showColorRelief}
          onCheckedChange={onToggleColorRelief}
        />
        <OptionRow
          label={t('layerOptionsPanel.showHillshade')}
          checked={showHillshade}
          onCheckedChange={onToggleHillshade}
        />
      </div>
    );
  }

  if (layer === 'districts') {
    return (
      <div>
        <OptionRow
          label={t('layerOptionsPanel.showDistrictsAsMarkers')}
          checked={showDistrictsAsMarkers}
          onCheckedChange={onToggleShowDistrictsAsMarkers}
        />
        {source === 'vellummap' && (
          <OptionRow
            label={t('layerOptionsPanel.showDistrictFill')}
            checked={showDistrictFill}
            onCheckedChange={onToggleShowDistrictFill}
          />
        )}
        {source === 'vellummap' && onToggleDistrictsColorBySpecialization && (
          <OptionRow
            label={t('districtSpecialization.title')}
            checked={colorDistrictsBySpecialization}
            onCheckedChange={onToggleDistrictsColorBySpecialization}
          />
        )}
        <OptionRow
          label={t('layerOptionsPanel.showParkAreas')}
          checked={showParkAreas}
          onCheckedChange={onToggleShowParkAreas}
        />
      </div>
    );
  }

  if (layer === 'roads') {
    return (
      <div>
        {source === 'vellummap' && (
          <OptionRow
            label={t('layerOptionsPanel.showStreetNames')}
            checked={showStreetNames}
            onCheckedChange={onToggleShowStreetNames}
          />
        )}
        <OptionRow
          label={t('layerOptionsPanel.showRailways')}
          checked={showRailways}
          onCheckedChange={onToggleShowRailways}
        />
        {source === 'vellummap' && (
          <OptionRow
            label={t('layerOptionsPanel.showFlights')}
            checked={showFlights}
            onCheckedChange={onToggleShowFlights}
          />
        )}
        <OptionRow
          label={t('layerOptionsPanel.showFerries')}
          checked={showFerries}
          onCheckedChange={onToggleShowFerries}
        />
      </div>
    );
  }

  if (layer === 'basemap') {
    return (
      <OptionRow
        label={t('layerOptionsPanel.showGrid')}
        checked={showGrid}
        onCheckedChange={onToggleShowGrid}
      />
    );
  }

  return null;
}
