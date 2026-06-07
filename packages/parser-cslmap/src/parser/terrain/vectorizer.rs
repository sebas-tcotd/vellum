use super::grid::{TERRAIN_CELL_SIZE, TERRAIN_GRID_SIZE, TERRAIN_MAP_ORIGIN};
use crate::city_data::{TerrainIsoline, TerrainPolygon, TerrainRing};
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
