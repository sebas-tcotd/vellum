/** Maps DLC park types to their resolved MapLibre marker colors. */

import type * as maplibregl from 'maplibre-gl';
import type { ResolvedColors } from '../style-adapter';

/**
 * Builds the data-driven color expression for park-area markers.
 *
 * Types without a theme color of their own borrow their family's: the
 * Industries areas take the industry color and Liberal Arts the university
 * one. `None` and unrecognized values deliberately use the generic color so
 * the renderer remains forward-compatible with new game/DLC park types.
 */
export function buildParkColorExpression(
  colors: ResolvedColors,
): maplibregl.ExpressionSpecification {
  return [
    'match',
    ['get', 'parkType'],
    'Generic',
    colors.parkAreas.generic,
    ['University', 'LiberalArts'],
    colors.parkAreas.university,
    'TradeSchool',
    colors.parkAreas.tradeSchool,
    ['Industry', 'Farming', 'Oil', 'Ore'],
    colors.parkAreas.industry,
    'Forestry',
    colors.parkAreas.forestry,
    colors.parkAreas.generic,
  ] as unknown as maplibregl.ExpressionSpecification;
}
