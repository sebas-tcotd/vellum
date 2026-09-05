import { useCallback } from 'react';
import type {
  BuildingServiceCategory,
  LayerName,
  MenuAction,
  TransitMode,
} from '@vellum/core';
import { LAYER_NAMES } from '@vellum/core';
import { useVellumStore } from '../store/vellum-store';
import type { CommandRegistry } from '../shell/commands';

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
  commands: CommandRegistry;
}

/**
 * Translates native menu actions into commands.
 *
 * @remarks
 * This adapter no longer decides *whether* an action applies — every menu
 * entry that also has a shortcut or a visual route goes through the shared
 * command registry, which owns availability (AD-3). Only the per-layer
 * advanced options resolve here, straight onto their store setters: they have
 * a single implementation shared with the layer detail panel, so there is no
 * second route to drift from.
 */
export function useMenuAction({
  commands,
}: UseMenuActionOptions): (action: MenuAction) => void {
  const cityData = useVellumStore((state) => state.cityData);
  const layerOptions = useVellumStore((state) => state.layerOptions);
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
      switch (action) {
        case 'menu.open-file':
          commands['document.open'].execute();
          return;
        case 'menu.open-export':
          commands['document.export'].execute();
          return;
        case 'menu.fit-to-screen':
          commands['view.fitCity'].execute();
          return;
        case 'menu.zoom-in':
          commands['view.zoomIn'].execute();
          return;
        case 'menu.zoom-out':
          commands['view.zoomOut'].execute();
          return;
        case 'menu.clean-mode':
          commands['view.cleanView'].execute();
          return;
        case 'menu.navigation-mode':
          commands['view.mapBounds'].execute();
          return;
        case 'menu.icon-legend':
          commands['view.mapSymbols'].execute();
          return;
        case 'menu.rotate-left':
          commands['view.rotate'].execute(-15);
          return;
        case 'menu.rotate-right':
          commands['view.rotate'].execute(15);
          return;
        case 'menu.reset-bearing':
          commands['view.resetNorth'].execute();
          return;
        case 'menu.toggle-transit-dimming':
          commands['style.transitDimming'].execute();
          return;
        default:
          break;
      }

      const layerPrefix = 'menu.toggle-layer.';
      if (action.startsWith(layerPrefix)) {
        const layer = action.slice(layerPrefix.length);
        if (isLayerName(layer)) commands['layer.toggle'].execute(layer);
        return;
      }

      const advancedPrefix = 'menu.open-advanced.';
      if (action.startsWith(advancedPrefix)) {
        const layer = action.slice(advancedPrefix.length);
        if (isLayerName(layer)) commands['layer.detail'].execute(layer);
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
        commands['style.set'].execute(action.slice(themePrefix.length));
      }
    },
    [
      commands,
      cityData,
      layerOptions,
      setBasemapShowGrid,
      setBuildingColorByCategory,
      setDistrictsShowNameOnMap,
      setDistrictsShowParkAreas,
      setTerrainShowColorRelief,
      setTerrainShowContourLines,
      setTerrainShowHillshade,
      toggleBuildingCategory,
      toggleTransitMode,
    ],
  );
}
