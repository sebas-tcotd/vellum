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
/// of this module's siblings compares mixed scales and is true for 0 of 1 168 561 cells.
/// Water classification is driven exclusively by [`is_water`].
pub const ELEVATION_UNITS_PER_METER: f64 = 64.0;

/// Minimum water depth, in raw units, for a cell to count as water (16 = 25 cm).
///
/// `res` in `<Ter>` is the water **depth** (`WaterSimulation.Cell.m_height`), not the
/// surface elevation: Vellum Bridge snapshots match it exactly in 99.9 % of wet cells
/// (`altavento`, `island-hopping`, 2026-09-23). Comparing it against `<SeaLevel>` (metres)
/// dropped every cell shallower than `SeaLevel / 64` m — 6 236 cells in `altavento`,
/// most of them 1–2.9 m deep, i.e. the shallow band of every shore.
///
/// ponytail: fixed threshold that hides the simulation's wet film; tune if shores look noisy.
pub const MIN_WATER_DEPTH: f64 = 16.0;

/// Whether a `<Ter>` cell holds water, from its `res` (depth) value.
pub fn is_water(res: f64) -> bool {
    res > MIN_WATER_DEPTH
}

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

/// Side of the vegetation density grid (`NaturalResourceManager.m_tree`): 512 × 512 cells.
pub const FOREST_GRID_SIZE: usize = 512;
/// World units per vegetation cell: 17280 / 512 = 33.75.
#[allow(clippy::cast_precision_loss)]
pub const FOREST_CELL_SIZE: f64 = 17280.0 / FOREST_GRID_SIZE as f64;

/// Parses one row of the `CSLExportXML` forest CSV format into `forest_grid`.
///
/// The `<Forests>` section contains 512 `<Forest>` child elements, each holding one
/// comma-separated row of 512 density integers (0–255). `row` is the 0-based index
/// of the current `<Forest>` element (incremented by the caller). `forest_grid` is the
/// row-major 512 × 512 density grid; cells are derived from it by [`forest_cells_from_grid`].
///
/// Grid: 512 × 512 cells covering the full 17280 × 17280 world-unit map (-8640…+8640).
pub fn parse_forest_csv(csv: &str, row: usize, forest_grid: &mut [u8]) {
    if row >= FOREST_GRID_SIZE {
        eprintln!("[parser-cslmap] Forest row {row} beyond the 512-row grid; ignored");
        return;
    }
    for (col, val) in csv.split(',').enumerate() {
        if col >= FOREST_GRID_SIZE {
            break; // guard against malformed rows
        }
        let density_raw: u32 = val.trim().parse().unwrap_or(0);
        // `m_tree` is a byte in the game: anything above 255 is a malformed export.
        let density = u8::try_from(density_raw).unwrap_or_else(|_| {
            eprintln!("[parser-cslmap] Forest density {density_raw} above 255; clamped");
            u8::MAX
        });
        if let Some(cell) = forest_grid.get_mut(row * FOREST_GRID_SIZE + col) {
            *cell = density;
        }
    }
}

/// Derives the non-empty `ForestCell`s of a row-major 512 × 512 density grid
/// (density = raw / 255). Shared by the `.cslmap` and `.vellummap` sources.
pub fn forest_cells_from_grid(forest_grid: &[u8]) -> Vec<ForestCell> {
    forest_grid
        .iter()
        .enumerate()
        .filter(|(_, &raw)| raw != 0)
        .map(|(idx, &raw)| {
            let row = idx / FOREST_GRID_SIZE;
            let col = idx % FOREST_GRID_SIZE;
            #[allow(clippy::cast_precision_loss)]
            let x = TERRAIN_MAP_ORIGIN + col as f64 * FOREST_CELL_SIZE;
            #[allow(clippy::cast_precision_loss)]
            let z = TERRAIN_MAP_ORIGIN + row as f64 * FOREST_CELL_SIZE;
            ForestCell {
                x,
                z,
                density: f64::from(raw) / 255.0,
            }
        })
        .collect()
}
