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
  /** Which layer's options to render — only `'transit'` and `'buildings'` have any. */
  layer: LayerName;
  visibleModes: TransitMode[];
  onToggleMode: (mode: TransitMode) => void;
  visibleCategories: BuildingServiceCategory[];
  onToggleCategory: (category: BuildingServiceCategory) => void;
}

/**
 * Secondary panel rendered under a layer row when its name is clicked
 * (see `future-work-panel-opciones-avanzadas.md`). Renders the transit-mode
 * filter or the buildings RICO filter, depending on `layer`.
 */
export function AdvancedOptionsPanel({
  layer,
  visibleModes,
  onToggleMode,
  visibleCategories,
  onToggleCategory,
}: AdvancedOptionsPanelProps) {
  const { t } = useTranslation();

  if (layer === 'transit') {
    return (
      <div
        role="group"
        aria-label={t('a11y.advancedOptions', { layer: t('layers.transit') })}
        className="bg-background/40 rounded my-1 py-1"
      >
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
      <div
        role="group"
        aria-label={t('a11y.advancedOptions', {
          layer: t('layers.buildings'),
        })}
        className="bg-background/40 rounded my-1 py-1"
      >
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

  return null;
}
