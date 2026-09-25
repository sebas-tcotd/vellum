//! District and park extents from the native area grids (`districts.bin`,
//! `parks.bin`). `.cslmap` only exports a label point per area; these grids are
//! what lets the native document draw each area's real boundary.

use crate::city_data::TerrainPolygon;
use crate::parser::terrain::grid::TERRAIN_MAP_ORIGIN;
use crate::parser::terrain::vectorizer::geo_poly_to_terrain_polygon;
use geo::Simplify;
use std::collections::HashMap;

/// Cells per side of an area grid.
pub(crate) const AREA_GRID_SIZE: usize = 900;
/// Side of one area cell in world units (17 280 / 900).
const AREA_CELL_SIZE: f64 = 19.2;
/// Bytes per cell: 4 area ids, then their 4 alphas.
const CELL_BYTES: usize = 8;
/// Douglas–Peucker tolerance for area outlines, in world units.
///
/// A binary mask contours into a staircase of 19.2 m steps, which reads as a
/// sawtooth on the map. Any tolerance above half a cell diagonal (≈13.6 m)
/// collapses each staircase into the diagonal it approximates; 16 m stays
/// below one cell, so no real corner of an area is cut.
const AREA_SIMPLIFY_TOLERANCE: f64 = 16.0;

/// The area that owns each cell: the slot with the highest alpha. Id `0` means
/// "no area" — it competes like any other id, so a cell mostly outside every
/// area stays unowned.
fn dominant_ids(grid: &[u8]) -> Vec<u8> {
    grid.chunks_exact(CELL_BYTES)
        .map(|cell| {
            (0..4)
                .filter(|&slot| cell[4 + slot] > 0)
                .max_by_key(|&slot| cell[4 + slot])
                .map_or(0, |slot| cell[slot])
        })
        .collect()
}

/// One boundary per area id present in `grid`, in WGS-84.
///
/// Each id is contoured on its own bounding box (plus a one-cell margin, so a
/// shape touching nothing but its box still closes), not on the whole 900² grid:
/// a city has dozens of areas and most are small.
pub(crate) fn area_boundaries(grid: &[u8]) -> HashMap<u8, Vec<TerrainPolygon>> {
    let owners = dominant_ids(grid);

    // Bounding box per id: (min col, min row, max col, max row).
    let mut boxes: HashMap<u8, (usize, usize, usize, usize)> = HashMap::new();
    for (index, &id) in owners.iter().enumerate() {
        if id == 0 {
            continue;
        }
        let (col, row) = (index % AREA_GRID_SIZE, index / AREA_GRID_SIZE);
        let entry = boxes.entry(id).or_insert((col, row, col, row));
        entry.0 = entry.0.min(col);
        entry.1 = entry.1.min(row);
        entry.2 = entry.2.max(col);
        entry.3 = entry.3.max(row);
    }

    boxes
        .into_iter()
        .map(|(id, (min_col, min_row, max_col, max_row))| {
            let col0 = min_col.saturating_sub(1);
            let row0 = min_row.saturating_sub(1);
            let width = (max_col + 2).min(AREA_GRID_SIZE) - col0;
            let height = (max_row + 2).min(AREA_GRID_SIZE) - row0;
            let mut mask = Vec::with_capacity(width * height);
            for row in row0..row0 + height {
                let start = row * AREA_GRID_SIZE + col0;
                mask.extend(owners[start..start + width].iter().map(|&owner| {
                    if owner == id {
                        1.0
                    } else {
                        0.0
                    }
                }));
            }
            (id, contour_mask(&mask, width, height, col0, row0))
        })
        .collect()
}

/// Marching squares over a binary mask whose samples sit at cell centres.
fn contour_mask(
    mask: &[f64],
    width: usize,
    height: usize,
    col0: usize,
    row0: usize,
) -> Vec<TerrainPolygon> {
    let origin = |first: usize| {
        // Grid offsets fit comfortably in f64; usize→f64 has no lossless From.
        #[allow(clippy::cast_precision_loss)]
        let first = first as f64;
        TERRAIN_MAP_ORIGIN + AREA_CELL_SIZE * (first + 0.5)
    };
    let builder = contour_isobands::ContourBuilder::new(width, height)
        .x_origin(origin(col0))
        .x_step(AREA_CELL_SIZE)
        .y_origin(origin(row0))
        .y_step(AREA_CELL_SIZE);
    match builder.contours(mask, &[0.5_f64, 1.5_f64]) {
        Ok(bands) => bands
            .iter()
            .flat_map(|band| {
                band.geometry()
                    .0
                    .iter()
                    .map(|poly| poly.simplify(AREA_SIMPLIFY_TOLERANCE))
                    // A sliver thinner than the tolerance can collapse — the
                    // shell drops the polygon, a collapsed hole just the hole.
                    .filter(|poly| poly.exterior().0.len() >= 4)
                    .map(|poly| {
                        let holes = poly
                            .interiors()
                            .iter()
                            .filter(|ring| ring.0.len() >= 4)
                            .cloned()
                            .collect();
                        geo::Polygon::new(poly.exterior().clone(), holes)
                    })
                    .map(|poly| geo_poly_to_terrain_polygon(&poly))
                    .collect::<Vec<_>>()
            })
            .collect(),
        Err(e) => {
            eprintln!("[parser-cslmap] area boundary vectorization error: {e}");
            vec![]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grid_with(cells: &[(usize, [u8; 8])]) -> Vec<u8> {
        let mut grid = vec![0u8; AREA_GRID_SIZE * AREA_GRID_SIZE * CELL_BYTES];
        for &(index, cell) in cells {
            grid[index * CELL_BYTES..(index + 1) * CELL_BYTES].copy_from_slice(&cell);
        }
        grid
    }

    #[test]
    fn highest_alpha_owns_the_cell_and_zero_means_none() {
        let grid = grid_with(&[
            (0, [3, 7, 0, 0, 40, 200, 0, 0]),
            (1, [0, 5, 0, 0, 255, 10, 0, 0]),
            (2, [9, 0, 0, 0, 0, 0, 0, 0]),
        ]);
        let owners = dominant_ids(&grid);
        assert_eq!(&owners[..3], &[7, 0, 0]);
    }

    /// Column grows in x and row in z from −8640, like the terrain grid. A
    /// block at a known cell must outline that cell's world position — the
    /// axis mix-up that once misaligned water and roads would fail here.
    #[test]
    fn a_boundary_lands_on_its_cells_world_position() {
        use crate::parser::terrain::vectorizer::world_to_wgs84;
        // 10×10 block at columns 100–109, rows 600–609.
        let cells: Vec<(usize, [u8; 8])> = (600..610)
            .flat_map(|row| (100..110).map(move |col| row * AREA_GRID_SIZE + col))
            .map(|i| (i, [5, 0, 0, 0, 255, 0, 0, 0]))
            .collect();
        let boundaries = area_boundaries(&grid_with(&cells));
        let ring = &boundaries[&5][0].exterior.0;

        let cell_centre = |i: f64| TERRAIN_MAP_ORIGIN + AREA_CELL_SIZE * (i + 0.5);
        let [min_lng, min_lat] = world_to_wgs84(cell_centre(99.5), cell_centre(599.5));
        let [max_lng, max_lat] = world_to_wgs84(cell_centre(109.5), cell_centre(609.5));
        let eps = 1e-9;
        for &[lng, lat] in ring {
            assert!((min_lng - eps..=max_lng + eps).contains(&lng), "lng {lng}");
            assert!((min_lat - eps..=max_lat + eps).contains(&lat), "lat {lat}");
        }
        // …and the outline actually spans the block, not a point inside it.
        let lngs: Vec<f64> = ring.iter().map(|p| p[0]).collect();
        let span = lngs.iter().copied().fold(f64::MIN, f64::max)
            - lngs.iter().copied().fold(f64::MAX, f64::min);
        assert!(span > (max_lng - min_lng) * 0.8, "span {span}");
    }

    #[test]
    fn one_closed_boundary_per_area() {
        // A 3×3 block of area 4 in the middle of the map, and one lone cell of area 9.
        let centre = 450 * AREA_GRID_SIZE + 450;
        let mut cells: Vec<(usize, [u8; 8])> = (0..3)
            .flat_map(|dr| (0..3).map(move |dc| centre + dr * AREA_GRID_SIZE + dc))
            .map(|i| (i, [4, 0, 0, 0, 255, 0, 0, 0]))
            .collect();
        cells.push((10, [9, 0, 0, 0, 255, 0, 0, 0]));
        let boundaries = area_boundaries(&grid_with(&cells));

        assert_eq!(boundaries.len(), 2);
        for id in [4, 9] {
            let polygons = &boundaries[&id];
            assert_eq!(polygons.len(), 1, "area {id}");
            let ring = &polygons[0].exterior.0;
            assert!(ring.len() >= 4, "area {id} ring {ring:?}");
            assert_eq!(ring.first(), ring.last(), "area {id} ring must close");
        }
    }
}
