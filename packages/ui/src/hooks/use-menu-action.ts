import { useCallback } from 'react';
import type {
  BuildingServiceCategory,
  LayerName,
  MenuAction,
  TransitMode,
} from '@vellum/core';
import { LAYER_NAMES } from '@vellum/core';
import { useVellumStore } from '../store/vellum-store';

function isLayerName(value: string): value is LayerName {
  return LAYER_NAMES.includes(value as LayerName);
}

function isTransitMode(value: string): value is TransitMode {
  return (
    value === 'Bus' ||
    value === 'Tram' ||
    value === 'Train' ||
    value === 'Metro' ||
    value === 'CableCar' ||
    value === 'Monorail' ||
    value === 'Ferry' ||
    value === 'Blimp' ||
    value === 'Trolleybus'
  );
}

function isBuildingCategory(value: string): value is BuildingServiceCategory {
  return (
    value === 'residential' ||
    value === 'industry' ||
    value === 'commercial' ||
    value === 'office'
  );
}

interface UseMenuActionOptions {
  openFileDialog: () => Promise<void>;
  handleOpenExport: () => void | Promise<void>;
  handleFitToScreen: () => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleHidePanel: () => void;
  handleToggleNavigationMode: () => void;
  handleToggleIconLegend: () => void;
  handleRotateBy: (delta: number) => void;
  handleResetBearing: () => void;
  handleOpenAdvancedOptions: (layer: LayerName) => void;
  isExporting: boolean;
}

/**
 * Translates native menu actions into store updates and renderer commands.
 * Keeping this adapter separate leaves the application component focused on composition.
 */
export function useMenuAction({
  openFileDialog,
  handleOpenExport,
  handleFitToScreen,
  handleZoomIn,
  handleZoomOut,
  handleHidePanel,
  handleToggleNavigationMode,
  handleToggleIconLegend,
  handleRotateBy,
  handleResetBearing,
  handleOpenAdvancedOptions,
  isExporting,
}: UseMenuActionOptions): (action: MenuAction) => void {
  const cityData = useVellumStore((state) => state.cityData);
  const loadingState = useVellumStore((state) => state.loadingState);
  const availableThemes = useVellumStore((state) => state.availableThemes);
  const layerOptions = useVellumStore((state) => state.layerOptions);
  const transitDimmingEnabled = useVellumStore(
    (state) => state.transitDimmingEnabled,
  );
  const toggleLayer = useVellumStore((state) => state.toggleLayer);
  const setActiveTheme = useVellumStore((state) => state.setActiveTheme);
  const setTransitDimmingEnabled = useVellumStore(
    (state) => state.setTransitDimmingEnabled,
  );
  const toggleTransitMode = useVellumStore((state) => state.toggleTransitMode);
  const toggleBuildingCategory = useVellumStore(
    (state) => state.toggleBuildingCategory,
  );
  const setBuildingColorByCategory = useVellumStore(
    (state) => state.setBuildingColorByCategory,
  );
  const setDistrictsShowNameOnMap = useVellumStore(
    (state) => state.setDistrictsShowNameOnMap,
  );
  const setDistrictsShowParkAreas = useVellumStore(
    (state) => state.setDistrictsShowParkAreas,
  );
  const setTerrainShowContourLines = useVellumStore(
    (state) => state.setTerrainShowContourLines,
  );
  const setTerrainShowColorRelief = useVellumStore(
    (state) => state.setTerrainShowColorRelief,
  );
  const setTerrainShowHillshade = useVellumStore(
    (state) => state.setTerrainShowHillshade,
  );
  const setBasemapShowGrid = useVellumStore(
    (state) => state.setBasemapShowGrid,
  );

  return useCallback(
    (action: MenuAction) => {
      if (action === 'menu.open-file') {
        void openFileDialog();
        return;
      }
      if (action === 'menu.open-export') {
        if (cityData !== null && loadingState !== 'loading' && !isExporting) {
          void handleOpenExport();
        }
        return;
      }
      if (action === 'menu.fit-to-screen') {
        if (cityData !== null) handleFitToScreen();
        return;
      }
      if (action === 'menu.zoom-in') {
        if (cityData !== null) handleZoomIn();
        return;
      }
      if (action === 'menu.zoom-out') {
        if (cityData !== null) handleZoomOut();
        return;
      }
      if (action === 'menu.clean-mode') {
        if (cityData !== null && loadingState !== 'loading') handleHidePanel();
        return;
      }
      if (action === 'menu.navigation-mode') {
        if (cityData !== null) handleToggleNavigationMode();
        return;
      }
      if (action === 'menu.icon-legend') {
        if (cityData !== null) handleToggleIconLegend();
        return;
      }
      if (action === 'menu.rotate-left') {
        if (cityData !== null) handleRotateBy(-15);
        return;
      }
      if (action === 'menu.rotate-right') {
        if (cityData !== null) handleRotateBy(15);
        return;
      }
      if (action === 'menu.reset-bearing') {
        if (cityData !== null) handleResetBearing();
        return;
      }
      if (action === 'menu.toggle-transit-dimming') {
        setTransitDimmingEnabled(!transitDimmingEnabled);
        return;
      }

      const layerPrefix = 'menu.toggle-layer.';
      if (action.startsWith(layerPrefix)) {
        const layer = action.slice(layerPrefix.length);
        if (cityData !== null && isLayerName(layer)) toggleLayer(layer);
        return;
      }

      const advancedPrefix = 'menu.open-advanced.';
      if (action.startsWith(advancedPrefix)) {
        const layer = action.slice(advancedPrefix.length);
        if (cityData !== null && isLayerName(layer)) {
          handleOpenAdvancedOptions(layer);
        }
        return;
      }

      const optionPrefix = 'menu.toggle-advanced.';
      if (action.startsWith(optionPrefix)) {
        if (cityData === null) return;
        const [, , layer, option] = action.split('.');
        if (layer === 'terrain') {
          if (option === 'contour-lines') {
            setTerrainShowContourLines(!layerOptions.terrain.showContourLines);
          } else if (option === 'color-relief') {
            setTerrainShowColorRelief(!layerOptions.terrain.showColorRelief);
          } else if (option === 'hillshade') {
            setTerrainShowHillshade(!layerOptions.terrain.showHillshade);
          }
        } else if (layer === 'basemap' && option === 'grid') {
          setBasemapShowGrid(!layerOptions.basemap.showGrid);
        } else if (layer === 'transit' && isTransitMode(option)) {
          toggleTransitMode(option);
        } else if (layer === 'buildings') {
          if (option === 'color-by-category') {
            setBuildingColorByCategory(!layerOptions.buildings.colorByCategory);
          } else if (isBuildingCategory(option)) {
            toggleBuildingCategory(option);
          }
        } else if (layer === 'districts') {
          if (option === 'show-names') {
            setDistrictsShowNameOnMap(!layerOptions.districts.showNameOnMap);
          } else if (option === 'show-park-areas') {
            setDistrictsShowParkAreas(!layerOptions.districts.showParkAreas);
          }
        }
        return;
      }

      const themePrefix = 'menu.theme.';
      if (action.startsWith(themePrefix)) {
        const themeId = action.slice(themePrefix.length);
        if (availableThemes.some((theme) => theme.id === themeId)) {
          setActiveTheme(themeId);
        }
      }
    },
    [
      availableThemes,
      cityData,
      handleFitToScreen,
      handleHidePanel,
      handleOpenAdvancedOptions,
      handleOpenExport,
      handleResetBearing,
      handleRotateBy,
      handleToggleIconLegend,
      handleToggleNavigationMode,
      handleZoomIn,
      handleZoomOut,
      isExporting,
      layerOptions,
      loadingState,
      openFileDialog,
      setActiveTheme,
      setBasemapShowGrid,
      setBuildingColorByCategory,
      setDistrictsShowNameOnMap,
      setDistrictsShowParkAreas,
      setTerrainShowColorRelief,
      setTerrainShowContourLines,
      setTerrainShowHillshade,
      setTransitDimmingEnabled,
      transitDimmingEnabled,
      toggleBuildingCategory,
      toggleLayer,
      toggleTransitMode,
    ],
  );
}
