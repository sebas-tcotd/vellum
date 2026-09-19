import type { ExportArea, ExportBackground } from '@vellum/core';
import type { MarginaliaOverlay } from './marginalia-raster';

/** Options for producing an isolated PNG raster from the current map state. */
export interface PngExportOptions {
  /** Requested raster density. */
  scale: 1 | 2 | 4;
  /** Current viewport or the full city extent. */
  area: ExportArea;
  /** Background treatment applied by the isolated export surface. */
  background: ExportBackground;
  /**
   * Frames the surface on `snapshot.camera` even for a `full-map` capture.
   *
   * @remarks
   * A full-map *file* never needs this: the tiled path derives a camera per
   * tile from `snapshot.extent`, and the legacy single-surface path is left on
   * the renderer's own `fitToCityBounds`, which is the behaviour its goldens
   * were measured against.
   *
   * A full-map *preview* does. It is a single surface too, and `fitToCityBounds`
   * frames the raw city bounds with its own padding — it has never heard of the
   * margin `resolveFullMapFraming` reserves for the map frame, so the preview
   * would show a different crop from the file and could still clip the frame
   * this story exists to keep whole.
   */
  frameOnSnapshotCamera?: boolean;
  /**
   * Marginalia painted over the frame before it is encoded.
   *
   * @remarks
   * Omitted for the dialog preview, which paints the final surface's layout
   * over the image itself.
   */
  marginalia?: MarginaliaOverlay | null;
}
