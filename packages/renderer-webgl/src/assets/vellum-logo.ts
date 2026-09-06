/**
 * Re-export shim: the Vellum watermark logo now lives in `@vellum/core`.
 *
 * @remarks
 * The logo is an inert SVG string plus its data-URI encoding — pure data with
 * no MapLibre dependency — so ADR-0001 moved it to the domain layer where
 * `ExportDialog` (in `@vellum/ui`) can render it without importing this
 * adapter. Kept as a barrel so relative imports inside the adapter and this
 * package's public surface are unchanged.
 *
 * @see {@link https://github.com/sebas-tcotd/vellum/blob/main/docs/adr/0001-rendering-ownership.md | ADR-0001}
 */
export {
  VELLUM_LOGO_SIZE,
  VELLUM_LOGO_SVG,
  vellumLogoDataUri,
  vellumLogoInnerSvg,
} from '@vellum/core';
