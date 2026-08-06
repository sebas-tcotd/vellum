use super::grid::{TERRAIN_CELL_SIZE, TERRAIN_GRID_SIZE, TERRAIN_MAP_ORIGIN};
use crate::city_data::{TerrainBand, TerrainIsoline, TerrainPolygon, TerrainRing};
use contour::ContourBuilder;
use geo::Simplify;

// ─── Terrain vectorization ────────────────────────────────────────────────────

/// CS1 world half-extent and WGS-84 scale constants (south-up convention, `CS1_LAT_SIGN = +1`).
pub const CS1_WORLD_HALF: f64 = 8640.0;
pub const CS1_EXTENT_DEG: f64 = (CS1_WORLD_HALF * 2.0) / 111_195.0;
pub const CS1_HALF_EXTENT_DEG: f64 = CS1_EXTENT_DEG / 2.0;

/// Base simplification tolerance in world-space units (32m = 2 grid cells).
/// Applied in two passes: DP first (coarse, fast), then VW (smooth curves, lighter N).
pub const SIMPLIFY_TOLERANCE: f64 = 32.0;

/// Converts a CS1 world-space point to WGS-84 `[longitude, latitude]`.
///
/// Uses south-up convention (`CS1_LAT_SIGN = +1`): positive Z → positive latitude.
/// This matches `coordinate-transform.ts` in the WebGL renderer — do not negate Z.
pub fn world_to_wgs84(world_x: f64, world_z: f64) -> [f64; 2] {
    let lng = (world_x / CS1_WORLD_HALF) * CS1_HALF_EXTENT_DEG;
    let lat = (world_z / CS1_WORLD_HALF) * CS1_HALF_EXTENT_DEG;
    [lng, lat]
}

/// Single-pass Douglas-Peucker at low tolerance so the polygon boundary stays
/// visually aligned with the coastline isoline extracted from the same rings.
pub fn simplify_polygon(poly: &geo::Polygon<f64>) -> geo::Polygon<f64> {
    poly.simplify(SIMPLIFY_TOLERANCE / 32.0)
}

/// Vectorizes the landmass into `TerrainPolygon`s using Marching Squares.
///
/// Interior holes correspond to inland water bodies (rivers and lakes).
/// Coordinates are in WGS-84 `[lng, lat]`, south-up convention.
///
/// # Errors emitted
/// Vectorization failures are logged to stderr and return an empty vec (no panic).
pub fn vectorize_land_polygon(
    _elev_grid: &[f64],
    res_grid: &[f64],
    sea_level: f64,
) -> Vec<TerrainPolygon> {
    // res_grid is continuous: 0.0 on dry land, > sea_level where water is present.
    // Using res_grid directly (vs. binary water mask) gives smooth sub-cell interpolation
    // at polygon boundaries — same organic quality as the coastline isoline.
    // Inland water bodies (res > sea_level) emerge naturally as holes in the isoband.
    match terrain_builder().contours(res_grid, &[0.0_f64, sea_level]) {
        Ok(bands) => bands
            .iter()
            .flat_map(|band| {
                band.geometry()
                    .0
                    .iter()
                    .map(|poly| geo_poly_to_terrain_polygon(&simplify_polygon(poly)))
                    .collect::<Vec<_>>()
            })
            .collect(),
        Err(e) => {
            eprintln!("[parser-cslmap] land polygon vectorization error: {e}");
            vec![]
        }
    }
}

/// Vectorizes inland water bodies (rivers and lakes) into `TerrainPolygon`s.
///
/// A cell is inland water when its elevation is above sea level but its resolution
/// (surface water height) also exceeds sea level.
pub fn vectorize_inland_water(
    elev_grid: &[f64],
    res_grid: &[f64],
    sea_level: f64,
) -> Vec<TerrainPolygon> {
    let inland_mask: Vec<f64> = elev_grid
        .iter()
        .zip(res_grid.iter())
        .map(|(&elev, &res)| {
            if elev > sea_level && res > sea_level {
                1.0
            } else {
                0.0
            }
        })
        .collect();

    match terrain_builder().contours(&inland_mask, &[0.5_f64, 1.5_f64]) {
        Ok(bands) => bands
            .iter()
            .flat_map(|band| {
                band.geometry()
                    .0
                    .iter()
                    .map(|poly| geo_poly_to_terrain_polygon(&simplify_polygon(poly)))
                    .collect::<Vec<_>>()
            })
            .collect(),
        Err(e) => {
            eprintln!("[parser-cslmap] inland water vectorization error: {e}");
            vec![]
        }
    }
}

/// Vectorizes the terrain into elevation isobands — closed, fillable polygons
/// covering `[elevation_min, elevation_max)` in raw game units.
///
/// The isolines from `vectorize_contour_lines` are open polylines and cannot be
/// filled; these are what lets a flat vector document (the SVG export) carry the
/// same hypsometric relief the interactive map gets from the DEM raster.
///
/// Takes the same `step` as the isolines, so every band edge coincides exactly
/// with a drawn contour line — the two cannot disagree.
///
/// Water is deliberately not masked out: bands paint below the water layer,
/// which covers the sea as the world extent with the landmasses punched out.
///
/// # Errors emitted
/// Vectorization failures are logged to stderr and return an empty vec (no panic).
pub fn vectorize_terrain_bands(elev_grid: &[f64], sea_level: f64, step: f64) -> Vec<TerrainBand> {
    let thresholds = band_thresholds(elev_grid, sea_level, step);
    if thresholds.len() < 2 {
        return vec![];
    }

    match terrain_builder().contours(elev_grid, &thresholds) {
        Ok(bands) => bands.iter().map(band_to_terrain_band).collect(),
        Err(e) => {
            eprintln!("[parser-cslmap] terrain band vectorization error: {e}");
            vec![]
        }
    }
}

/// Band edges from `sea_level` upward, the last one past the summit so the top
/// band is closed. Fewer than two edges means there is no dry land to band.
fn band_thresholds(elev_grid: &[f64], sea_level: f64, step: f64) -> Vec<f64> {
    let max_elev = elev_grid.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let mut thresholds = vec![sea_level];
    let mut current = sea_level + step;
    while current < max_elev + step {
        thresholds.push(current);
        current += step;
    }
    thresholds
}

fn band_to_terrain_band(band: &contour_isobands::Band) -> TerrainBand {
    TerrainBand {
        elevation_min: band.min_v(),
        elevation_max: band.max_v(),
        polygons: band
            .geometry()
            .0
            .iter()
            .map(|poly| geo_poly_to_terrain_polygon(&simplify_polygon(poly)))
            .collect(),
    }
}

pub fn vectorize_contour_lines(
    elev_grid: &[f64],
    sea_level: f64,
    step: f64,
) -> Vec<TerrainIsoline> {
    let max_elev = elev_grid.iter().copied().fold(f64::NEG_INFINITY, f64::max);

    if max_elev <= sea_level {
        return vec![];
    }

    // Calcular los umbrales de elevación
    let mut thresholds = Vec::new();
    let mut current = sea_level + step;
    while current <= max_elev {
        thresholds.push(current);
        current += step;
    }

    // Constructor de la cuadrícula (ajusta orígenes/pasos según tu parse_cslmap)
    let builder = ContourBuilder::new(1081, 1081, true)
        .x_origin(-8640.0) // Tu TERRAIN_MAP_ORIGIN
        .y_origin(-8640.0)
        .x_step(16.0) // Tu TERRAIN_CELL_SIZE
        .y_step(16.0);

    match builder.lines(elev_grid, &thresholds) {
        Ok(contour_lines) => contour_lines
            .into_iter()
            .map(|contour_line| {
                let lines: Vec<Vec<[f64; 2]>> = contour_line
                    .geometry()
                    .0 // MultiLineString contiene un vector de LineStrings
                    .iter()
                    .map(|linestring| {
                        // 1. Simplificar la línea para matar el ruido y bajar el peso
                        let simplified = linestring.simplify(SIMPLIFY_TOLERANCE / 512.0);

                        // 2. Convertir coordenadas a WGS-84 (reutilizando world_to_wgs84)
                        simplified
                            .into_iter()
                            .map(|c| world_to_wgs84(c.x, c.y))
                            .collect()
                    })
                    .filter(|line: &Vec<[f64; 2]>| line.len() > 1) // Descartar puntos solitarios
                    .collect();

                TerrainIsoline {
                    elevation: contour_line.threshold(),
                    lines,
                }
            })
            .collect(),
        Err(e) => {
            eprintln!("[parser-cslmap] error vectorizando isolíneas: {e}");
            vec![]
        }
    }
}

/// Converts a `geo::Polygon<f64>` in world-space to a `TerrainPolygon` in WGS-84.
pub fn geo_poly_to_terrain_polygon(poly: &geo::Polygon<f64>) -> TerrainPolygon {
    let exterior = TerrainRing(
        poly.exterior()
            .coords()
            .map(|c| world_to_wgs84(c.x, c.y))
            .collect(),
    );
    let holes = poly
        .interiors()
        .iter()
        .map(|ring| TerrainRing(ring.coords().map(|c| world_to_wgs84(c.x, c.y)).collect()))
        .collect();
    TerrainPolygon { exterior, holes }
}

/// Extracts the coastline as a `TerrainIsoline` from the already-built land polygons.
///
/// Since `land_polygon` is now derived from `res_grid` via `contour_isobands` (smooth
/// interpolation), its rings are organically curved. Extracting them as lines guarantees
/// zero geometric offset between the fill polygon and the coastline stroke.
pub fn coastline_from_land_polygons(polygons: &[TerrainPolygon], sea_level: f64) -> TerrainIsoline {
    let lines = polygons
        .iter()
        .flat_map(|poly| {
            std::iter::once(poly.exterior.0.clone()).chain(poly.holes.iter().map(|h| h.0.clone()))
        })
        .filter(|l| l.len() > 1)
        .collect();
    TerrainIsoline {
        elevation: sea_level,
        lines,
    }
}

/// Returns a `ContourBuilder` pre-configured to output coordinates in CS1 world-space.
pub fn terrain_builder() -> contour_isobands::ContourBuilder {
    contour_isobands::ContourBuilder::new(TERRAIN_GRID_SIZE, TERRAIN_GRID_SIZE)
        .x_origin(TERRAIN_MAP_ORIGIN)
        .x_step(TERRAIN_CELL_SIZE)
        .y_origin(TERRAIN_MAP_ORIGIN)
        .y_step(TERRAIN_CELL_SIZE)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A grid that ramps linearly from `sea_level` to `sea_level + 3 * step`,
    /// so the expected band count is known exactly.
    fn ramp_grid(sea_level: f64, step: f64) -> Vec<f64> {
        // Walking the elevation up per row keeps this free of usize→f64 casts,
        // which clippy rejects workspace-wide.
        let mut grid = Vec::with_capacity(TERRAIN_GRID_SIZE * TERRAIN_GRID_SIZE);
        let mut elevation = sea_level;
        let rise = 3.0 * step / GRID_ROW_SPANS;
        for _ in 0..TERRAIN_GRID_SIZE {
            grid.extend(std::iter::repeat_n(elevation, TERRAIN_GRID_SIZE));
            elevation += rise;
        }
        grid
    }

    /// Gaps between grid rows — `TERRAIN_GRID_SIZE - 1`, as a literal so no cast
    /// is needed. `grid_row_spans_matches_the_grid` keeps the two in sync.
    const GRID_ROW_SPANS: f64 = 1080.0;

    #[test]
    fn grid_row_spans_matches_the_grid() {
        assert_eq!(TERRAIN_GRID_SIZE, 1081);
    }

    #[test]
    fn band_edges_start_at_sea_level_and_close_on_the_summit() {
        // Edges walk up from sea level; the last one lands on the summit, so
        // the top band is closed and nothing is banded above the terrain.
        assert_eq!(
            band_thresholds(&[40.0, 3240.0, 6440.0], 40.0, 3200.0),
            vec![40.0, 3240.0, 6440.0]
        );
        // A summit between two edges still gets an edge above it.
        assert_eq!(
            band_thresholds(&[40.0, 5000.0], 40.0, 3200.0),
            vec![40.0, 3240.0, 6440.0]
        );
    }

    #[test]
    fn a_fully_submerged_map_produces_no_bands() {
        // Nothing above sea level means nothing to band — and the isoband
        // builder must never be handed a single-edge threshold list.
        assert!(band_thresholds(&[10.0, 20.0], 40.0, 3200.0).len() < 2);
        assert!(vectorize_terrain_bands(&[10.0, 20.0], 40.0, 3200.0).is_empty());
    }

    #[test]
    fn bands_tile_the_elevation_range_without_gaps() {
        let bands = vectorize_terrain_bands(&ramp_grid(40.0, 3200.0), 40.0, 3200.0);
        assert_eq!(bands.len(), 3, "three steps of range means three bands");
        for pair in bands.windows(2) {
            // A gap or an overlap here would show as a seam or a double-painted
            // strip in the exported SVG.
            assert!((pair[0].elevation_max - pair[1].elevation_min).abs() < 1e-9);
        }
        assert!(bands.iter().any(|b| !b.polygons.is_empty()));
    }

    #[test]
    fn band_edges_line_up_with_the_contour_lines_drawn_at_the_same_step() {
        let grid = ramp_grid(40.0, 3200.0);
        let bands = vectorize_terrain_bands(&grid, 40.0, 3200.0);
        let lines = vectorize_contour_lines(&grid, 40.0, 3200.0);
        for line in &lines {
            assert!(
                bands
                    .iter()
                    .any(|b| (b.elevation_max - line.elevation).abs() < 1e-9),
                "isoline at {} has no band edge to sit on",
                line.elevation
            );
        }
    }
}
