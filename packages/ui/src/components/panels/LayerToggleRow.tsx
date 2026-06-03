import { useTranslation } from 'react-i18next';
import { Switch } from '@/lib/switch';
import type { LayerName } from '@vellum/core';

/** Props for a single layer toggle row inside the FloatingLayerPanel. */
export interface LayerToggleRowProps {
  /** The map layer this row controls. Must match a key of {@link LayerVisibility}. */
  layer: LayerName;
  /** Whether the layer is currently rendered in the OffscreenCanvas worker. */
  visible: boolean;
  /** Called when the user toggles the switch. */
  onToggle: (layer: LayerName, visible: boolean) => void;
  /**
   * Active visual theme. Controls the color dot saturation:
   * `'day'` renders at 100% saturation; `'transit'` renders at 40% opacity.
   *
   * @remarks Story 5.x will pass `'transit'` when the transit theme is active.
   * @default 'day'
   */
  theme?: 'day' | 'transit';
  /** Hex color string for the layer's color dot (e.g. `'#6db8b7'`). */
  color: string;
}

/**
 * A single layer-visibility toggle row for use inside {@link FloatingLayerPanel}.
 *
 * @remarks
 * **CRITICAL RULE:** This component is purely presentational — it never reads from the
 * Zustand store directly. All state flows in via props; all mutations flow out via `onToggle`.
 */
export function LayerToggleRow({
  layer,
  visible,
  onToggle,
  theme = 'day',
  color,
}: LayerToggleRowProps) {
  const { t } = useTranslation();

  return (
    <div style={{ minHeight: 32 }} className="flex items-center gap-2 px-3">
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
          opacity: theme === 'transit' ? 0.4 : 1,
        }}
      />
      <span className="font-ui flex-1 text-xs truncate">
        {t(`layers.${layer}`)}
      </span>
      <Switch
        checked={visible}
        onCheckedChange={(checked) => onToggle(layer, checked)}
        aria-checked={visible}
        aria-label={t(`layers.${layer}`)}
      />
    </div>
  );
}
