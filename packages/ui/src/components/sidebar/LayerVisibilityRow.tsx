import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { Switch } from '../../lib/switch';
import type { LayerName } from '@vellum/core';

export interface LayerVisibilityRowProps {
  layer: LayerName;
  /** Whether the layer is currently rendered. */
  visible: boolean;
  onToggleVisible: (layer: LayerName) => void;
  icon: ReactNode;
  /** Dims the leading indicator while the Transit style dims everything else. */
  dimIndicator?: boolean;
  /** Whether this layer has a detail context to disclose. */
  hasDetail?: boolean;
  /** Whether this layer's detail is the one currently open. */
  detailOpen?: boolean;
  onOpenDetail?: (layer: LayerName, invoker?: string) => void;
  /** `data-focus-id` given to the disclosure, so Back can return focus to it. */
  disclosureFocusId?: string;
}

/**
 * One layer in the appearance overview.
 *
 * @remarks
 * **Visibility and disclosure are two separate controls (AD-11).** The switch
 * shows or hides the layer; the chevron opens its configuration. Neither
 * implies the other, they carry their own accessible names and focus stops,
 * and a hidden layer can still have its detail opened — its controls will not
 * silently turn the layer back on. The row itself is not clickable, so there
 * is no third, ambiguous target between them.
 */
export function LayerVisibilityRow({
  layer,
  visible,
  onToggleVisible,
  icon,
  dimIndicator = false,
  hasDetail = false,
  detailOpen = false,
  onOpenDetail,
  disclosureFocusId,
}: LayerVisibilityRowProps) {
  const { t } = useTranslation();
  const name = t(`layers.${layer}`);

  return (
    <div
      className="shell-layer-row"
      data-layer={layer}
      data-detail-open={detailOpen ? 'true' : undefined}
    >
      <span
        aria-hidden="true"
        className="shell-layer-row__indicator"
        style={{ opacity: dimIndicator ? 0.4 : 1 }}
      >
        {icon}
      </span>
      <span className="shell-layer-row__name">{name}</span>
      {hasDetail && (
        <button
          type="button"
          className="shell-layer-row__disclosure"
          data-focus-id={disclosureFocusId}
          aria-expanded={detailOpen}
          aria-label={t('a11y.configureLayer', { layer: name })}
          onClick={() => onOpenDetail?.(layer, disclosureFocusId)}
        >
          <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
      <Switch
        checked={visible}
        onCheckedChange={() => onToggleVisible(layer)}
        aria-label={name}
      />
    </div>
  );
}
