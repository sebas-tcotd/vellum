/**
 * Re-export shim: the hover, viewport and legend vocabulary now lives in `@vellum/core`.
 *
 * @remarks
 * The subscription ports that carry these types are declared in the domain
 * layer (`MapSubscriptionsPort`), so the types had to move with them —
 * a port cannot be declared in `core` while its payload lives in the adapter
 * (ADR-0001). Kept as a barrel so the adapter's relative imports and this
 * package's public surface are unchanged.
 */
export type {
  DistrictTooltipInfo,
  ServiceIconLegendState,
  TooltipInfo,
  TransitLineInfo,
  TransitTooltipInfo,
  ViewportBounds,
} from '@vellum/core';
