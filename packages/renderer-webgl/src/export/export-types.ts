import type { ExportArea, ExportBackground } from '@vellum/core';

/** Options for producing an isolated PNG raster from the current map state. */
export interface PngExportOptions {
  /** Requested raster density. */
  scale: 1 | 2 | 4;
  /** Current viewport or the full city extent. */
  area: ExportArea;
  /** Background treatment applied by the isolated export surface. */
  background: ExportBackground;
}
