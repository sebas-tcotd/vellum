import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import type { CitySource, LayerName } from '@vellum/core';
import { useVellumStore } from '../../store/vellum-store';
import { AdvancedOptionsPanel } from '../panels/AdvancedOptionsPanel';

export interface LayerDetailPanelProps {
  layer: LayerName;
  /** Format of the open document; options that need native data hide for `.cslmap`. */
  source?: CitySource | undefined;
  /** Returns to the overview. Focus restoration is handled by the sidebar. */
  onBack: () => void;
}

/**
 * One layer's configuration, replacing the sidebar body below the persistent
 * document header (AD-4).
 *
 * @remarks
 * Only the presentation changed in the migration: the controls themselves are
 * still `AdvancedOptionsPanel`, writing to the same store setters the Layers
 * menu uses. Nothing here changes the layer's visibility — a hidden layer
 * stays hidden while you configure it (AD-11).
 */
export function LayerDetailPanel({
  layer,
  source,
  onBack,
}: LayerDetailPanelProps) {
  const { t } = useTranslation();
  const layerOptions = useVellumStore((s) => s.layerOptions);
  const toggleTransitMode = useVellumStore((s) => s.toggleTransitMode);
  const setTransitShowConfirmedTransfers = useVellumStore(
    (s) => s.setTransitShowConfirmedTransfers,
  );
  const toggleBuildingCategory = useVellumStore(
    (s) => s.toggleBuildingCategory,
  );
  const setBuildingColorByCategory = useVellumStore(
    (s) => s.setBuildingColorByCategory,
  );
  const setDistrictsShowAsMarker = useVellumStore(
    (s) => s.setDistrictsShowAsMarker,
  );
  const setDistrictsColorBySpecialization = useVellumStore(
    (s) => s.setDistrictsColorBySpecialization,
  );
  const setDistrictsShowFill = useVellumStore((s) => s.setDistrictsShowFill);
  const setDistrictsShowParkAreas = useVellumStore(
    (s) => s.setDistrictsShowParkAreas,
  );
  const setTerrainShowContourLines = useVellumStore(
    (s) => s.setTerrainShowContourLines,
  );
  const setTerrainShowColorRelief = useVellumStore(
    (s) => s.setTerrainShowColorRelief,
  );
  const setTerrainShowHillshade = useVellumStore(
    (s) => s.setTerrainShowHillshade,
  );
  const setBasemapShowGrid = useVellumStore((s) => s.setBasemapShowGrid);
  const setRoadsShowRailways = useVellumStore((s) => s.setRoadsShowRailways);
  const setRoadsShowFlights = useVellumStore((s) => s.setRoadsShowFlights);
  const setRoadsShowFerries = useVellumStore((s) => s.setRoadsShowFerries);
  const setRoadsShowStreetNames = useVellumStore(
    (s) => s.setRoadsShowStreetNames,
  );
  const setForestsShowCircles = useVellumStore((s) => s.setForestsShowCircles);
  const setForestsShowHeatmap = useVellumStore((s) => s.setForestsShowHeatmap);
  const layerName = t(`layers.${layer}`);

  return (
    <section
      className="shell-section"
      aria-labelledby="shell-layer-detail-heading"
    >
      <button
        type="button"
        className="shell-back"
        data-testid="layer-detail-back"
        onClick={onBack}
      >
        <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
        {t('sidebar.mapAppearance')}
      </button>
      <h2 className="shell-section__heading" id="shell-layer-detail-heading">
        {layerName}
      </h2>
      <AdvancedOptionsPanel
        layer={layer}
        showForestCircles={layerOptions.forests.showCircles}
        onToggleForestCircles={setForestsShowCircles}
        showForestHeatmap={layerOptions.forests.showHeatmap}
        onToggleForestHeatmap={setForestsShowHeatmap}
        visibleModes={layerOptions.transit.visibleModes}
        onToggleMode={toggleTransitMode}
        showConfirmedTransfers={layerOptions.transit.showConfirmedTransfers}
        onToggleShowConfirmedTransfers={setTransitShowConfirmedTransfers}
        visibleCategories={layerOptions.buildings.visibleCategories}
        onToggleCategory={toggleBuildingCategory}
        colorByCategory={layerOptions.buildings.colorByCategory}
        onToggleColorByCategory={setBuildingColorByCategory}
        showDistrictsAsMarkers={layerOptions.districts.showAsMarker}
        onToggleShowDistrictsAsMarkers={setDistrictsShowAsMarker}
        colorDistrictsBySpecialization={
          layerOptions.districts.colorBySpecialization
        }
        onToggleDistrictsColorBySpecialization={
          setDistrictsColorBySpecialization
        }
        showDistrictFill={layerOptions.districts.showFill}
        onToggleShowDistrictFill={setDistrictsShowFill}
        source={source}
        showParkAreas={layerOptions.districts.showParkAreas}
        onToggleShowParkAreas={setDistrictsShowParkAreas}
        showContourLines={layerOptions.terrain.showContourLines}
        onToggleContourLines={setTerrainShowContourLines}
        showColorRelief={layerOptions.terrain.showColorRelief}
        onToggleColorRelief={setTerrainShowColorRelief}
        showHillshade={layerOptions.terrain.showHillshade}
        onToggleHillshade={setTerrainShowHillshade}
        showGrid={layerOptions.basemap.showGrid}
        onToggleShowGrid={setBasemapShowGrid}
        showRailways={layerOptions.roads.showRailways}
        onToggleShowRailways={setRoadsShowRailways}
        showFlights={layerOptions.roads.showFlights}
        onToggleShowFlights={setRoadsShowFlights}
        showFerries={layerOptions.roads.showFerries}
        onToggleShowFerries={setRoadsShowFerries}
        showStreetNames={layerOptions.roads.showStreetNames}
        onToggleShowStreetNames={setRoadsShowStreetNames}
      />
    </section>
  );
}
