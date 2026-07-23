/** Tunable constants for the transit render geometry (dimensions, node padding, search limits). */

/** Rendered line width, in world meters (the paper's `w`). */
export const LINE_WIDTH_M = 3;
/** Gap between adjacent lines, in world meters. */
export const LINE_SPACING_M = 1.5;
/** Width of one line slot (line + gap) — the meters behind one offset-index unit. */
export const SLOT_M = LINE_WIDTH_M + LINE_SPACING_M;

export const NODE_PAD_M = 2;
export const BEZIER_ARM_FACTOR = 0.4;
export const BEZIER_SAMPLES = 8;
export const MAX_TRIM_FRACTION = 0.4;

/** Stops closer than this (world meters) are merged into one station (CSLMap convention). */
export const STATION_MERGE_THRESHOLD_M = 48;
/**
 * Half-thickness of a station marker *along* its corridor, in world meters —
 * the capsule's short (minor) axis. The long axis runs *across* the corridor,
 * spanning the stopping lines, so the capsule sits perpendicular to the line
 * (paper §5.4 / Fig. 10). Equal to half a line width, so a single-line stop
 * degenerates to a small circle and multi-line stops become perpendicular
 * capsules.
 */
export const STATION_HALF_THICKNESS_M = LINE_WIDTH_M * 1.25;
/** Extra perpendicular margin so the marker slightly overhangs the lines it covers. */
export const STATION_ACROSS_MARGIN_M = LINE_WIDTH_M * 1.25;
/** Arc segments per rounded corner of a station marker (higher = smoother). */
export const STATION_CORNER_STEPS = 4;
