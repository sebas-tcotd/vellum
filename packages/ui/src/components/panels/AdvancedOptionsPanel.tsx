import { Separator } from '@/lib/separator';
import { Switch } from '@/lib/switch';
import type {
  BuildingServiceCategory,
  LayerName,
  TransitMode,
} from '@vellum/core';
import { TRANSIT_MODES } from '@vellum/core';
import { useTranslation } from 'react-i18next';

/** Modes rendered as checkboxes — excludes `'Unknown'`, which has no display
 * label (see `transitModes.Unknown` in the locale files) and is always kept
 * visible rather than exposed as a togglable row. */
const TOGGLABLE_TRANSIT_MODES = TRANSIT_MODES.filter((m) => m !== 'Unknown');

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
    <div className="flex items-center gap-2 px-3" style={{ minHeight: 28 }}>
      <span className="font-ui flex-1 text-xs truncate opacity-80">
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/** Props for {@link AdvancedOptionsPanel}. */
export interface AdvancedOptionsPanelProps {
  /** Which layer's options to render — only `'transit'`, `'buildings'`, and `'districts'` have any. */
  layer: LayerName;
  visibleModes: TransitMode[];
  onToggleMode: (mode: TransitMode) => void;
  visibleCategories: BuildingServiceCategory[];
  onToggleCategory: (category: BuildingServiceCategory) => void;
  /** Whether R/I/C/O buildings render in fixed RICO colors instead of the theme default. */
  colorByCategory: boolean;
  onToggleColorByCategory: (enabled: boolean) => void;
  /** Whether districts render as a text label on the map instead of the default marker circle. */
  showDistrictNamesOnMap: boolean;
  onToggleShowDistrictNamesOnMap: (enabled: boolean) => void;
}

/**
 * Content of the advanced-options floating panel (see `FloatingLayerPanel.tsx`
 * for the panel chrome). Renders the transit-mode filter or the buildings RICO
 * filter + "color by category" toggle, depending on `layer`.
 */
export function AdvancedOptionsPanel({
  layer,
  visibleModes,
  onToggleMode,
  visibleCategories,
  onToggleCategory,
  colorByCategory,
  onToggleColorByCategory,
  showDistrictNamesOnMap,
  onToggleShowDistrictNamesOnMap,
}: AdvancedOptionsPanelProps) {
  const { t } = useTranslation();

  if (layer === 'transit') {
    return (
      <div className="grid grid-cols-2 gap-x-3">
        {TOGGLABLE_TRANSIT_MODES.map((mode) => (
          <OptionRow
            key={mode}
            label={t(`transitModes.${mode}`)}
            checked={visibleModes.includes(mode)}
            onCheckedChange={() => onToggleMode(mode)}
          />
        ))}
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

  if (layer === 'districts') {
    return (
      <OptionRow
        label={t('layerOptionsPanel.showDistrictNamesOnMap')}
        checked={showDistrictNamesOnMap}
        onCheckedChange={onToggleShowDistrictNamesOnMap}
      />
    );
  }

  return null;
}
