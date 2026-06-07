use super::handlers::{
    buildings::BuildingBuilder, districts::DistrictBuilder, roads::RoadBuilder,
    transit::TransitBuilder,
};
use super::terrain::grid::TERRAIN_GRID_SIZE;
use super::terrain::{grid, texture, vectorizer};
use super::types::TextElement;
use crate::city_data::{CityData, ForestCell};
use crate::errors::VellumError;

// ─── Builder ─────────────────────────────────────────────────────────────────

#[derive(Default)]
pub(crate) struct CityDataBuilder {
    // City metadata
    city_name: String,
    generated_at: String,
    sea_level: f64,

    // Raw terrain grids (row-major, 1081×1081). Populated during Ter CSV parse;
    // vectorized into TerrainPolygon/TerrainBand in build().
    elev_grid: Vec<f64>,
    res_grid: Vec<f64>,
    forest_row: usize,
    forest_cells: Vec<ForestCell>,

    // Pending text content for simple text elements
    pending_text: String,
    text_element: TextElement,

    // Domain sub-builders
    roads: RoadBuilder,
    transit: TransitBuilder,
    buildings: BuildingBuilder,
    districts: DistrictBuilder,
}

impl CityDataBuilder {
    #[allow(clippy::unnecessary_wraps)]
    pub(crate) fn handle_start(
        &mut self,
        e: &quick_xml::events::BytesStart<'_>,
    ) -> Result<(), VellumError> {
        let local = e.name().local_name();
        self.pending_text.clear();
        self.text_element = TextElement::None;

        match local.as_ref() {
            b"CSLExportXML" => {}
            b"City" => self.text_element = TextElement::City,
            b"Generated" => self.text_element = TextElement::Generated,
            b"SeaLevel" => self.text_element = TextElement::SeaLevel,
            b"Ter" => self.text_element = TextElement::Ter,
            b"Forest" => self.text_element = TextElement::Forest,
            _ => {
                if let Some(te) = self.roads.handle_start(e) {
                    self.text_element = te;
                }
                self.transit.handle_start(e);
                self.buildings.handle_start(e);
                self.districts.handle_start(e);
            }
        }

        Ok(())
    }

    #[allow(clippy::unnecessary_wraps)]
    pub(crate) fn handle_empty(
        &mut self,
        e: &quick_xml::events::BytesStart<'_>,
    ) -> Result<(), VellumError> {
        self.roads.handle_empty(e);
        self.transit
            .handle_empty(e, &self.roads.node_position_index);
        self.buildings.handle_empty(e);
        self.districts.handle_empty(e);
        Ok(())
    }

    pub(crate) fn handle_text(&mut self, text: &str) {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return;
        }
        match self.text_element {
            TextElement::City => self.city_name.push_str(trimmed),
            TextElement::Generated => self.generated_at.push_str(trimmed),
            TextElement::SeaLevel | TextElement::Ter | TextElement::Forest => {
                self.pending_text.push_str(trimmed);
            }
            TextElement::Sg => self.roads.handle_text_sg(trimmed),
            TextElement::None => {}
        }
    }

    pub(crate) fn handle_end(&mut self, e: &quick_xml::events::BytesEnd<'_>) {
        let local = e.name().local_name();
        self.text_element = TextElement::None;

        match local.as_ref() {
            b"SeaLevel" => {
                let text = std::mem::take(&mut self.pending_text);
                if let Ok(v) = text.trim().parse::<f64>() {
                    if v.is_finite() {
                        self.sea_level = v;
                    } else {
                        eprintln!("[parser-cslmap] SeaLevel value is not finite: {text:?}");
                    }
                } else if !text.is_empty() {
                    eprintln!("[parser-cslmap] SeaLevel parse failed: {text:?}");
                }
            }
            b"Ter" => {
                let csv = std::mem::take(&mut self.pending_text);
                if !csv.is_empty() {
                    grid::parse_terrain_csv(&csv, &mut self.elev_grid, &mut self.res_grid);
                }
            }
            b"Forest" => {
                let csv = std::mem::take(&mut self.pending_text);
                if !csv.is_empty() {
                    grid::parse_forest_csv(&csv, self.forest_row, &mut self.forest_cells);
                    self.forest_row += 1;
                }
            }
            _ => {
                self.roads.handle_end(local.as_ref());
                self.transit
                    .handle_end(local.as_ref(), &mut self.roads.transit_route_by_nodes);
                self.buildings.handle_end(local.as_ref());
                self.districts.handle_end(local.as_ref());
            }
        }
    }

    pub(crate) fn warnings(&self) -> &[String] {
        &self.roads.warnings
    }

    #[allow(clippy::unnecessary_wraps)]
    pub(crate) fn build(mut self) -> Result<CityData, VellumError> {
        for w in &self.roads.warnings {
            eprintln!("[parser-cslmap] DLC warning: {w}");
        }

        let sea_level = self.sea_level;

        let expected_len = TERRAIN_GRID_SIZE * TERRAIN_GRID_SIZE;
        if self.elev_grid.len() < expected_len {
            if !self.elev_grid.is_empty() {
                eprintln!(
                    "[parser-cslmap] Terrain grid has {} entries, expected {}; padding with zeros",
                    self.elev_grid.len(),
                    expected_len
                );
            }
            self.elev_grid.resize(expected_len, 0.0);
            self.res_grid.resize(expected_len, 0.0);
        }

        let bounds = self.roads.bounds.into_bounds(sea_level);
        let land_polygon =
            vectorizer::vectorize_land_polygon(&self.elev_grid, &self.res_grid, sea_level);
        let coastline = vectorizer::vectorize_coastline_isoline(&self.res_grid, sea_level);
        let inland_water_polygons =
            vectorizer::vectorize_inland_water(&self.elev_grid, &self.res_grid, sea_level);
        let contour_lines = vectorizer::vectorize_contour_lines(&self.elev_grid, sea_level, 3200.0);
        let terrain_texture =
            texture::generate_terrain_texture(&self.elev_grid, &self.res_grid, sea_level)?;

        Ok(CityData {
            city_name: self.city_name,
            file_name: String::new(),
            generated_at: self.generated_at,
            bounds,
            land_polygon,
            coastline,
            inland_water_polygons,
            contour_lines,
            terrain_texture,
            road_nodes: self.roads.road_nodes,
            road_segments: self.roads.road_segments,
            transit_lines: self.transit.transit_lines,
            buildings: self.buildings.buildings,
            forest_cells: self.forest_cells,
            districts: self.districts.districts,
        })
    }
}
