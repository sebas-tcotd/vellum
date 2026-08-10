# District Rendering Strategy for Vellum (CSLMap Compatibility Phase)

## Context

During analysis of both:

- the original JavaScript map viewer
- the exported `.cslmap` file

it was discovered that district data is significantly more limited than initially expected.

The `.cslmap` format does not contain district boundaries, district polygons, or district cell ownership information.

Instead, each district stores only:

```text
District
 ├─ ID
 ├─ Name
 └─ Single Position
```

Example:

```xml
<Dist id="127" name="Centro Histórico">
    <p x="691.2004" y="206.956787" z="2900.73657" />
</Dist>
```

The position appears to represent a label anchor or district centroid.

---

## What the original viewer actually renders

The original JavaScript implementation does not render district areas.

The renderer simply:

1. Reads the district position.
2. Reads the district name.
3. Creates an SVG text element.
4. Places the label at the stored coordinates.

Conceptually:

```text
District Data
      ↓
(Name + Position)
      ↓
SVG Text Label
```

No geometry is created.

No polygons are created.

No boundaries are rendered.

No district overlay exists.

## Current Vellum implementation

Vellum preserves the same data constraint but offers two point-based display
modes through MapLibre:

- a default marker circle at the district position;
- an optional text label using the district name, with collision handling and a
  text halo.

Both modes are annotations. Neither one implies that Vellum knows the district's
true area.

---

## SVG rendering process

The relevant implementation creates:

```svg
<text>
```

positioned at:

```text
x = district.x
y = -district.z
```

using the district name as the label text.

Example result:

```text
      Centro Histórico
```

displayed directly on the map.

---

## Stroke and fill technique

The original viewer duplicates each text element.

Visual structure:

```text
Stroke Text
     +
Fill Text
```

Implementation concept:

```text
Label
 ├─ Black Outline
 └─ White Fill
```

This produces readable labels over complex backgrounds such as terrain, roads, and buildings.

Equivalent visual effect:

```text
█████████████████
 Centro Histórico
█████████████████
```

This is purely a text rendering enhancement and does not imply district geometry.

---

## Important limitation of the `.cslmap` format

The limitation is not caused by the viewer.

The limitation originates from the exported `.cslmap` file itself.

The format currently exposes:

```text
District Name
District Position
```

but does not expose:

```text
District Borders
District Cells
District Polygons
District Shapes
District Ownership Maps
```

Therefore no renderer can reconstruct true district boundaries from `.cslmap` data alone.

---

## Implications for Vellum

During the CSLMap compatibility phase, Vellum should replicate the behavior of the original viewer.

Recommended district model:

```rust
pub struct District {
    pub id: u32,
    pub name: String,
    pub position: Vec3,
}
```

Rendering model:

```text
District
     ↓
Label
```

This guarantees parity with existing CSLMap viewers.

---

## What Vellum should not attempt yet

Avoid:

- district polygon reconstruction
- district contour generation
- district area estimation
- fake district borders
- procedural district shapes

These would introduce information that does not actually exist in the source data.

The objective of the CSLMap phase is faithful rendering, not inference.

---

## Future expansion

Once Vellum transitions from CSLMap exports to direct Cities: Skylines integration, district rendering can be substantially improved.

Potential future data sources:

```text
Cities: Skylines API
        ↓
District Manager
        ↓
District Cells
        ↓
District Geometry
```

Possible future features:

- real district boundaries
- district area overlays
- district heatmaps
- district statistics
- district ownership visualization
- district thematic styling

At that stage Vellum will no longer be constrained by the CSLMap export format.

---

## Recommended implementation

Render districts as point annotations, matching the information available in the
source format:

```text
District Name
       +
Position
       ↓
Outlined Label
```

Layer placement:

```text
Terrain
    ↓
Forests
    ↓
Buildings
    ↓
Roads
    ↓
Transit
    ↓
District Labels
```

The current app uses a marker by default and can switch to the outlined label
mode. Both remain faithful to the available data.

---

## Final recommendation

Treat districts as annotations, not geographic regions.

For the CSLMap compatibility phase:

```text
District = Label
```

For the future Cities: Skylines integration phase:

```text
District = Geographic Area + Metadata + Visualization
```

Until richer data becomes available, district rendering should remain intentionally simple and fully aligned with the source format.
