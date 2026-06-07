use super::grid::TERRAIN_GRID_SIZE;
use crate::errors::VellumError;
use std::io::Cursor;

// ─── Terrain texture ─────────────────────────────────────────────────────────

/// Colour stops for the elevation palette (`elevation_threshold`, R, G, B).
/// Elevations below `sea_level` are transparent. Values in game units.
const ELEVATION_PALETTE: &[(f64, u8, u8, u8)] = &[
    (0.0, 149, 174, 121), // low: #95ae79
    (0.4, 222, 221, 190), // mid: #deddbe
    (0.8, 196, 160, 106), // high:rgb(196, 160, 106)
    (1.0, 160, 115, 48),  // clamp top: rgb(160, 115, 48)
];

/// Bakes a 1081×1081 RGBA terrain texture from the elevation grid.
///
/// Land pixels are tinted by elevation with contour lines baked in. Water pixels
/// (below sea level or covered by inland water) are fully transparent so the
/// `MapLibre` water layer shows through.
///
/// Returns a `data:image/png;base64,…` string ready for use as a `MapLibre` image source.
///
/// # Errors
/// Returns `VellumError::InternalError` if PNG encoding fails (should not happen in practice).
pub fn generate_terrain_texture(
    elev_grid: &[f64],
    res_grid: &[f64],
    sea_level: f64,
) -> Result<String, VellumError> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use image::{ImageBuffer, ImageOutputFormat, Rgba, RgbaImage};

    #[allow(clippy::cast_possible_truncation)]
    const GRID: u32 = TERRAIN_GRID_SIZE as u32;

    let max_elev = elev_grid
        .iter()
        .copied()
        .filter(|&e| e > sea_level)
        .fold(sea_level + 1.0, f64::max);
    let elev_range = (max_elev - sea_level).max(1.0);

    let mut img: RgbaImage = ImageBuffer::new(GRID, GRID);

    #[allow(clippy::many_single_char_names)]
    for (i, (&elev, &res)) in elev_grid.iter().zip(res_grid.iter()).enumerate() {
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let px = (i as u32) % GRID;
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let py = (i as u32) / GRID;

        let render_y = GRID - 1 - py; // Inversión del eje Y

        let is_water = elev <= sea_level || res > sea_level;
        if is_water {
            img.put_pixel(px, render_y, Rgba([0, 0, 0, 0]));
            continue;
        }

        let norm_t = ((elev - sea_level) / elev_range).clamp(0.0, 1.0);
        let (red, green, blue) = elevation_color(norm_t);

        // Píxel puro, sin líneas negras
        img.put_pixel(px, render_y, Rgba([red, green, blue, 255]));
    }

    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageOutputFormat::Png)
        .map_err(|e| VellumError::ExportFailed {
            reason: format!("terrain texture encode failed: {e}"),
        })?;

    let encoded = STANDARD.encode(buf.into_inner());
    Ok(format!("data:image/png;base64,{encoded}"))
}

/// Maps a normalised elevation `t ∈ [0.0, 1.0]` to an RGB colour via the palette.
pub fn elevation_color(t: f64) -> (u8, u8, u8) {
    for i in 0..ELEVATION_PALETTE.len().saturating_sub(1) {
        let (t0, r0, g0, b0) = ELEVATION_PALETTE[i];
        let (t1, r1, g1, b1) = ELEVATION_PALETTE[i + 1];
        if t <= t1 {
            let seg_t = if (t1 - t0).abs() < f64::EPSILON {
                0.0
            } else {
                (t - t0) / (t1 - t0)
            };
            return lerp_color((r0, g0, b0), (r1, g1, b1), seg_t);
        }
    }
    let (_, r, g, b) = *ELEVATION_PALETTE.last().unwrap_or(&(1.0, 196, 160, 106));
    (r, g, b)
}

/// Linear-interpolates between two colours by `t ∈ [0.0, 1.0]`.
fn lerp_color(a: (u8, u8, u8), b: (u8, u8, u8), t: f64) -> (u8, u8, u8) {
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let lerp = |lo: u8, hi: u8| (f64::from(lo) + (f64::from(hi) - f64::from(lo)) * t) as u8;
    (lerp(a.0, b.0), lerp(a.1, b.1), lerp(a.2, b.2))
}
