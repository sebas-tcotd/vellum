# Forest Rendering Strategy for CSL Map Viewer

## Context

The original JavaScript viewer does not render individual trees or forest geometry. Instead, it reads the `<Forests>` section from the `.cslmap` file and generates a raster overlay.

The relevant data structure is effectively:

```text
512 x 512 grid
```

where each cell stores a forest density value (0–255).

The current implementation:

1. Reads all `<Forest>` rows.
2. Creates a 512×512 RGBA image.
3. Uses a fixed dark green color.
4. Stores the forest value in the alpha channel.
5. Converts the image into a PNG.
6. Draws the PNG as an SVG image covering the entire map.

Conceptually:

```text
Forest Density Grid
        ↓
RGBA Texture
        ↓
PNG
        ↓
SVG <image>
```

This approach is extremely efficient but produces a visibly rasterized result when zooming or inspecting the output closely.

---

# Desired Visual Result

The goal is not to render individual trees.

Instead, we want to reproduce the appearance of the Cities: Skylines resource overlays, where forests appear as:

- soft density regions
- diffuse green patches
- gradual transitions
- no visible pixel grid
- visually similar to a heatmap

Example visual characteristics:

```text
Dense forest
███████

Medium density
▓▓▓▓▒▒▒

Low density
▒▒▒░░░░

No forest
transparent
```

---

# Recommended Approach

## Option A (Recommended)

Render forests as a density texture with smoothing.

Pipeline:

```text
Forest Grid (512×512)
          ↓
RGBA Texture
          ↓
Upscale
          ↓
Gaussian Blur
          ↓
Color Mapping
          ↓
Canvas Overlay
```

### Benefits

- Closest visual match to Cities: Skylines
- Very fast
- Simple implementation
- No geometry generation required
- Works naturally with zooming

---

# Suggested Rendering Steps

## Step 1

Read the forest grid exactly as currently parsed.

Input:

```rust
forest[y][x] -> u8
```

Range:

```text
0..255
```

---

## Step 2

Generate a grayscale density texture.

Example:

```text
density = forest_value / 255.0
```

---

## Step 3

Upscale before displaying.

Suggested scale:

```text
512 → 2048
```

or

```text
512 → 4096
```

using bilinear interpolation.

This removes obvious pixel boundaries.

---

## Step 4

Apply Gaussian blur.

Suggested radius:

```text
4px – 12px
```

depending on zoom level.

This transforms hard pixels into organic patches.

---

## Step 5

Apply a forest color ramp.

Example:

```text
0.00 → transparent
0.20 → very light green
0.50 → medium green
0.80 → dark green
1.00 → deep forest green
```

Potential palette:

```text
rgba(70,120,70,0.00)
rgba(90,150,80,0.20)
rgba(70,140,60,0.40)
rgba(40,110,40,0.60)
rgba(20,80,20,0.80)
```

---

## Step 6

Render as an overlay layer.

Suggested layer order:

```text
Terrain
    ↓
Forest Overlay
    ↓
Buildings
    ↓
Roads
    ↓
Transit
    ↓
Labels
```

---

# Alternative Approach (Future Enhancement)

## Marching Squares

The forest density grid can be converted into vector contours.

Pipeline:

```text
Forest Grid
      ↓
Marching Squares
      ↓
Polygons
      ↓
Canvas/SVG
```

Advantages:

- Infinite zoom quality
- GIS-style visualization
- Crisp contours

Disadvantages:

- More implementation effort
- Less faithful to the Cities: Skylines overlay appearance

Because the target aesthetic resembles the in-game resource view, this approach is not recommended for the first implementation.

---

# Final Recommendation

Implement forests as a smoothed density overlay:

```text
Forest Grid
      ↓
Upscaled Texture
      ↓
Gaussian Blur
      ↓
Green Density Coloring
      ↓
Canvas Layer
```

Do not render individual trees.

Do not generate forest polygons initially.

Treat the forest data as a continuous density field and visualize it similarly to a heatmap. This most closely matches the appearance of the Cities: Skylines natural resources overlay while remaining simple and performant.
