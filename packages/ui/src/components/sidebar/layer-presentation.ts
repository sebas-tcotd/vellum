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
