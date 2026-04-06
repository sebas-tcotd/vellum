/**
 * Soft limit (in megabytes) for `.cslmap` file sizes.
 * @remarks
 * Exceeding this threshold triggers a performance warning in the UI, but
 * there is no hard restriction enforced by the parsing engine.
 */
export const MAX_FILE_SIZE_MB = 50;

/**
 * The default visual theme identifier applied upon launching the application.
 * @remarks
 * Corresponds to a `.vellumstyle` configuration loaded by the theme engine.
 */
export const DEFAULT_THEME = "day";

/**
 * The default base sea level threshold in game units.
 * @remarks
 * Typical value found in standard _Cities: Skylines 1_ `.cslmap` files.
 * Domain Invariant: Any spatial point where `y < SEA_LEVEL_DEFAULT` is strictly
 * considered submerged or underground.
 */
export const SEA_LEVEL_DEFAULT = 40;

/**
 * Half of the total map extent in game units.
 * @remarks
 * The game world spans from `-8640` to `+8640` along both the X (east-west)
 * and Z (north-south) axes, resulting in a total logical area of `17280 x 17280`.
 */
export const GAME_MAP_HALF_EXTENT = 8640;

/**
 * Maximum spatial radius in game units used to visually group transit stops.
 * @remarks
 * Transit stops located within this radius (≤ 48 units) from each other are merged
 * into a single aggregate tooltip in the UI to prevent clutter.
 */
export const STOP_MERGE_RADIUS_UNITS = 48;
