# Forest rendering

Both `.cslmap` and `.vellummap` provide `CityData.forestCells`, a 512 × 512 vegetation density field. These cells do not contain real tree positions.

The Forests detail panel offers two independent switches, both enabled by default:

- **Vegetation circles** controls the current detail crowns (`forests-trees`). They appear from zoom 15, retaining the existing zoom threshold, small circles, darker rims and shadows. Crown count follows cell density and positions use a deterministic cell hash. These are a visual representation of density, not surveyed trees.
- **Heatmap** controls the continuous canopy (`forests-canopy`) at every zoom. Two box blur passes smooth the density field, which is interpolated to a 2048 × 2048 surface. Its soft threshold, density opacity and darker patch rims retain the existing appearance.

The heatmap sits below the circles. Disabling either switch does not change the other representation or the global Forests visibility. When both switches are off, no vegetation is drawn and the panel explains why. Hidden forests stay hidden while their options or theme change; reopening the layer restores the selected representations.

PNG exports use the same renderer and switches on a separate headless surface. Export snapshots capture the options and theme by value. SVG exports remain self-contained vectors: canopy alpha and shading are traced into editable density bands with holes, and circles reuse the exact deterministic world positions and radii used by the detail tiles. The canopy bands approximate the continuous opacity in sixteen levels; no raster preview is embedded. Crowns retain the zoom-15 threshold derived from the snapshot extent and output surface (the same effective zoom as PNG).
