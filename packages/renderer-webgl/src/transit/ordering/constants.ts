/** Tunable constants for the line-ordering optimization (weights, search limits, tie-break priority). */

import type { TransitMode } from '@vellum/core';

// Objective weights, per §6 of the paper (all further scaled by deg(v)).
export const W_CROSS_SAME_SEG = 4;
export const W_CROSS_DIFF_SEG = 1;
export const W_SEPARATION = 3;

// Search limits.
export const EXHAUSTIVE_SPACE_LIMIT = 1000;
export const MAX_PERMS_PER_EDGE = 720; // 6! — above this, only adjacent swaps are tried
export const MAX_HILL_CLIMB_PASSES = 8;

// Mode priority used ONLY as a deterministic tie-break for otherwise
// unconstrained orderings and for laying out lines inside a bundle.
export const MODE_PRIORITY: Record<TransitMode, number> = {
  Metro: 0,
  Train: 1,
  Monorail: 2,
  Tram: 3,
  Trolleybus: 4,
  CableCar: 5,
  Ferry: 6,
  Blimp: 7,
  Bus: 8,
  Unknown: 9,
};
