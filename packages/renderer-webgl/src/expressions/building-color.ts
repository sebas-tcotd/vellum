/**
 * Builds MapLibre data-driven color expressions for the buildings layer.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import { RICO_COLORS, type BuildingServiceCategory } from '@vellum/core';
import type * as maplibregl from 'maplibre-gl';
import type { ResolvedColors } from '../style-adapter';

/**
 * Resolves one building's fill or stroke colour directly, without MapLibre.
 *
 * @remarks
 * The rule the `match`/`case` expression below encodes, expressed as a plain
 * function so a static exporter can evaluate it per feature. Both callers read
 * from here, so a colour rule can never apply on the map and not in an export.
 *
 * @param colors - Resolved theme colours.
 * @param type - Whether the fill or the stroke colour is wanted.
 * @param category - The building's top-level zoning group.
 * @param civicKind - Civic subcategory, or `null` for non-civic buildings.
 * @param colorByCategory - Whether the RICO overlay is enabled.
 * @returns The CSS colour string for this building.
 */
export function resolveBuildingColor(
  colors: ResolvedColors,
  type: 'fill' | 'stroke',
  category: BuildingServiceCategory,
  civicKind: 'publicTransport' | 'education' | 'services' | null,
  colorByCategory: boolean,
): string {
  const fallback =
    type === 'fill' ? colors.buildingFill : colors.buildingStroke;
  if (category === 'civic') {
    return civicKind ? colors.buildingCivic[civicKind][type] : fallback;
  }
  if (!colorByCategory) return fallback;
  return category === 'none' ? fallback : RICO_COLORS[category][type];
}

/**
 * Builds the buildings fill/stroke color expression.
 *
 * Civic buildings always use their theme-specific subcategory color
 * (`publicTransport`/`education`/`services`). Residential/commercial/
 * industry/office buildings use the fixed {@link RICO_COLORS} only when
 * `colorByCategory` is enabled; otherwise (and for the `none` category) they
 * fall back to the theme's flat default building color.
 */
export function buildBuildingColorExpression(
  colors: ResolvedColors,
  type: 'fill' | 'stroke',
  colorByCategory: boolean,
): maplibregl.ExpressionSpecification {
  const fallback =
    type === 'fill' ? colors.buildingFill : colors.buildingStroke;

  const civicMatch = [
    'match',
    ['get', 'civicKind'],
    'publicTransport',
    colors.buildingCivic.publicTransport[type],
    'education',
    colors.buildingCivic.education[type],
    'services',
    colors.buildingCivic.services[type],
    fallback,
  ];

  if (!colorByCategory) {
    return [
      'case',
      ['==', ['get', 'category'], 'civic'],
      civicMatch,
      fallback,
    ] as unknown as maplibregl.ExpressionSpecification;
  }

  const ricoMatch = [
    'match',
    ['get', 'category'],
    'residential',
    RICO_COLORS.residential[type],
    'commercial',
    RICO_COLORS.commercial[type],
    'industry',
    RICO_COLORS.industry[type],
    'office',
    RICO_COLORS.office[type],
    fallback,
  ];

  return [
    'case',
    ['==', ['get', 'category'], 'civic'],
    civicMatch,
    ricoMatch,
  ] as unknown as maplibregl.ExpressionSpecification;
}
