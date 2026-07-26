use crate::city_data::ForestCell;

// ─── Terrain CSV parsing ──────────────────────────────────────────────────────

pub const TERRAIN_GRID_SIZE: usize = 1081;
pub const TERRAIN_CELL_SIZE: f64 = 16.0;
pub const TERRAIN_MAP_ORIGIN: f64 = -8640.0;

/// Raw `.cslmap` elevation units per metre.
///
/// `<Ter>` stores elevations as 16-bit game units where one unit is 1/64 m — measured
/// on real exports: `altavento.cslmap` spans 1600…40517 raw = 25.0…633.1 m, and the
/// 3200-unit contour interval used by `vectorize_contour_lines` is exactly 50 m.
///
/// **Caveat (do not "fix" without a separate decision).** `<SeaLevel>` is reported in
/// metres (187.031 in `altavento`), so the `elev <= sea_level` term in the water tests
/// of this module's siblings compares mixed scales and is true for 0 of 1 168 561 cells
/// — water classification is driven exclusively by `res > sea_level`, which works
/// because `res` is 0 on dry land. Making the comparison dimensionally consistent would
/// reclassify roughly half the map as water, so it is deliberately left alone.
pub const ELEVATION_UNITS_PER_METER: f64 = 64.0;

/// Parses the `CSLExportXML` terrain CSV format: `"elev:res,elev:res,..."`
/// Grid is 1081×1081, row-major. Fills `elev_grid` and `res_grid` for later vectorization.
pub fn parse_terrain_csv(csv: &str, elev_grid: &mut Vec<f64>, res_grid: &mut Vec<f64>) {
    let capacity = TERRAIN_GRID_SIZE * TERRAIN_GRID_SIZE;
    elev_grid.reserve(capacity);
    res_grid.reserve(capacity);

    for (idx, entry) in csv.split(',').enumerate() {
        let entry = entry.trim();
        let row = idx / TERRAIN_GRID_SIZE;
        if row >= TERRAIN_GRID_SIZE {
            eprintln!("[parser-cslmap] Terrain grid overflow at index {idx}; extra data ignored");
            break;
        }

        let mut parts = entry.splitn(2, ':');
        let raw_elev: f64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0.0);
        let raw_res: f64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0.0);

        // Always push to maintain row-major index alignment, even for empty/malformed entries.
        elev_grid.push(raw_elev);
        res_grid.push(raw_res);
    }
}

/// Parses one row of the `CSLExportXML` forest CSV format.
///
/// The `<Forests>` section contains 512 `<Forest>` child elements, each holding one
/// comma-separated row of 512 density integers (0–255). `row` is the 0-based index
/// of the current `<Forest>` element (incremented by the caller).
///
/// Grid: 512 × 512 cells covering the full 17280 × 17280 world-unit map (-8640…+8640).
/// Cell size: 17280 / 512 = 33.75 world units per side.
pub fn parse_forest_csv(csv: &str, row: usize, forest_cells: &mut Vec<ForestCell>) {
    const FOREST_GRID: usize = 512;
    const MAP_SIZE: f64 = 17280.0; // total world span (-8640 to +8640)
    #[allow(clippy::cast_precision_loss)]
    const CELL_SIZE: f64 = MAP_SIZE / FOREST_GRID as f64; // 33.75 world units
    const MAP_ORIGIN: f64 = -8640.0;

    for (col, val) in csv.split(',').enumerate() {
        if col >= FOREST_GRID {
            break; // guard against malformed rows
        }
        let density_raw: u32 = val.trim().parse().unwrap_or(0);
        if density_raw == 0 {
            continue;
        }
        #[allow(clippy::cast_precision_loss)]
        let x = MAP_ORIGIN + col as f64 * CELL_SIZE;
        #[allow(clippy::cast_precision_loss)]
        let z = MAP_ORIGIN + row as f64 * CELL_SIZE;
        let density = f64::from(density_raw) / 255.0;
        forest_cells.push(ForestCell { x, z, density });
    }
}
