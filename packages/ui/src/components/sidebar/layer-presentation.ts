import type { LayerName } from '@vellum/core';
import {
  Building2,
  Bus,
  LayoutGrid,
  Map,
  Mountain,
  Route,
  TreePine,
  type LucideIcon,
} from 'lucide-react';

/** Lucide icon for each map layer. */
export const LAYER_ICONS: Record<LayerName, LucideIcon> = {
  terrain: Mountain,
  basemap: Map,
  roads: Route,
  transit: Bus,
  buildings: Building2,
  forests: TreePine,
  districts: LayoutGrid,
};

/**
 * Leading-indicator colour per layer, sampled from the `day` cartographic
 * theme so a row reads as the geometry it controls.
 *
 * @remarks
 * These are shell affordances, not map colours: `theme-engine` remains the
 * only authority over what the map itself paints.
 */
export const LAYER_COLORS: Record<LayerName, string> = {
  terrain: '#c4a06a',
  basemap: '#6db8b7',
  roads: '#d2938e',
  transit: '#a098b0',
  buildings: '#c8bfb5',
  forests: '#95ae79',
  districts: '#b4a08c',
};
