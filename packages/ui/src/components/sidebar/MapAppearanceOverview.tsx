import { useTranslation } from 'react-i18next';
import type { LayerName } from '@vellum/core';
import { LAYERS_WITH_ADVANCED_OPTIONS, LAYER_NAMES } from '@vellum/core';
import { useVellumStore } from '../../store/vellum-store';
import type { CommandRegistry } from '../../shell/commands';
import { LAYER_COLORS, LAYER_ICONS } from './layer-presentation';
import { LayerVisibilityRow } from './LayerVisibilityRow';
import { MapStyleSection } from './MapStyleSection';

export interface MapAppearanceOverviewProps {
  commands: CommandRegistry;
}

/** `data-focus-id` of a layer's disclosure, so Back can restore focus to it. */
export const layerDisclosureFocusId = (layer: LayerName): string =>
  `layer-disclosure-${layer}`;

/** Resting state of the appearance sidebar: how the map is drawn, and what is drawn. */
export function MapAppearanceOverview({
  commands,
}: MapAppearanceOverviewProps) {
  const { t } = useTranslation();
  const activeLayers = useVellumStore((s) => s.activeLayers);
  const activeTheme = useVellumStore((s) => s.activeTheme);
  const transitDimmingEnabled = useVellumStore((s) => s.transitDimmingEnabled);
  const dimIndicator = activeTheme === 'transit' && transitDimmingEnabled;

  return (
    <>
      <MapStyleSection commands={commands} />
      <section className="shell-section" aria-labelledby="shell-layers-heading">
        <h2 className="shell-section__heading" id="shell-layers-heading">
          {t('sidebar.layers')}
        </h2>
        {LAYER_NAMES.map((layer) => {
          const Icon = LAYER_ICONS[layer];
          return (
            <LayerVisibilityRow
              key={layer}
              layer={layer}
              visible={activeLayers[layer]}
              onToggleVisible={commands['layer.toggle'].execute}
              color={LAYER_COLORS[layer]}
              icon={<Icon size={14} strokeWidth={1.5} />}
              dimIndicator={dimIndicator}
              hasDetail={LAYERS_WITH_ADVANCED_OPTIONS.has(layer)}
              onOpenDetail={commands['layer.detail'].execute}
              disclosureFocusId={layerDisclosureFocusId(layer)}
              // The disclosure names itself as the focus origin, so Back
              // returns focus here rather than to the section heading.
            />
          );
        })}
      </section>
    </>
  );
}
