/**
 * Re-export shim: the fixed-color service-icon catalogue now lives in `@vellum/core`.
 *
 * @remarks
 * The icon paths, the `ItemClass` → `ServiceGroup` mapping and the data-URI
 * encoding are pure data with no MapLibre dependency, so ADR-0001 moved them to
 * the domain layer where `IconLegend` (in `@vellum/ui`) can read them without
 * importing this adapter. Kept as a barrel so the adapter's relative imports and
 * this package's public surface are unchanged.
 *
 * @see {@link https://github.com/sebas-tcotd/vellum/blob/main/docs/adr/0001-rendering-ownership.md | ADR-0001}
 */
export {
  buildServiceIconSvg,
  resolveServiceGroup,
  serviceIconDataUri,
  SERVICE_GROUPS,
  SERVICE_ICONS_MIN_ZOOM,
  type ServiceGroup,
} from '@vellum/core';
