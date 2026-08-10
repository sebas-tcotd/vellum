/**
 * Local tile server for the terrain DEM, exposed to MapLibre as a custom protocol.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 *
 * **Why this exists.** MapLibre's `color-relief` and `hillshade` layers both require a
 * `raster-dem` source, and `RasterDEMSourceSpecification` only accepts `url` (TileJSON)
 * or `tiles` (URL templates) — there is no single-image variant. The parser, however,
 * hands us the whole DEM as one 1081×1081 PNG data URI inside `CityData`. This module
 * bridges the two: it decodes that PNG once and serves slices of it as z/x/y tiles via
 * `maplibregl.addProtocol`, so no HTTP server, no extra IPC round trip and no
 * filesystem access are needed.
 *
 * **Projection.** The DEM is equirectangular (the parser maps CS1 Z linearly to
 * latitude) while tiles are Web Mercator. Placing one into the other is done with a
 * plain linear stretch: the map spans ±0.0777° about the equator, where the Mercator
 * scale factor departs from 1.0 by under 1e-6 — far below a pixel across a 512 px tile.
 * `coordinate-transform.ts` relies on the same property.
 */

import type { TerrainDem } from '@vellum/core';
import maplibregl from 'maplibre-gl';
import { CS1_HALF_EXTENT_DEG } from '../coordinate-transform';

/** URL scheme MapLibre uses to request DEM tiles from this module. */
export const DEM_PROTOCOL = 'vellum-dem';

/** Tile URL template to hand to the `raster-dem` source. */
export const DEM_TILE_URL = `${DEM_PROTOCOL}://{z}/{x}/{y}`;

/** Edge length of the tiles this protocol serves, in pixels. */
export const DEM_TILE_SIZE = 512;

/**
 * Zoom at which one tile is closest to the map's own extent
 * (`360 / 2^z ≈ 0.1554°` ⇒ `z ≈ 11.2`), so the served range brackets it.
 */
export const DEM_MIN_ZOOM = 10;
/** Highest zoom served; MapLibre overzooms beyond it instead of requesting more tiles. */
export const DEM_MAX_ZOOM = 12;

/**
 * Decode factors for the DEM, matching the parser's `R·256 + G` packing so the value the
 * `color-relief` expression sees is the **raw game elevation unit** — the same unit
 * `TerrainIsoline.elevation` already uses. Metres are `raw / 64`.
 *
 * **`blueFactor` must never be zero, however unused the blue channel is.** MapLibre packs
 * each colour-relief elevation stop into the ramp texture with
 * `a = round((stop + baseShift) / Math.min(redFactor, greenFactor, blueFactor))`
 * (`maplibre-gl` 5.24, the `Rl` helper feeding `getColorRampTextures`). A zero blue
 * factor makes that `min` zero, every stop packs to `NaN`, and the shader then paints the
 * whole map with the ramp's last colour — which looks exactly like a working ramp whose
 * domain is wrong, so it is worth stating plainly. `1/256` is the smallest factor that
 * keeps the packer well-defined while contributing nothing to the decoded value, since
 * the parser always writes `B = 0`.
 *
 * With a valid blue factor the documented metre-scaling factors (`256/64` and `1/64`)
 * would work too. Raw units are the deliberate choice: they match
 * `TerrainIsoline.elevation` and need no conversion anywhere in the contract.
 */
export const DEM_ENCODING = {
  encoding: 'custom',
  redFactor: 256,
  greenFactor: 1,
  blueFactor: 1 / 256,
  baseShift: 0,
} as const;

/** Widest value the parser's 16-bit R/G packing can hold. */
const MAX_PACKED_ELEVATION = 65535;

/**
 * Raw `.cslmap` elevation units per metre — mirrors `ELEVATION_UNITS_PER_METER` in Rust.
 *
 * Exported because anything reasoning about *slope* rather than altitude has to divide
 * by it: MapLibre computes hillshade gradients against real-world tile spacing, so a DEM
 * carrying raw units reads 64× too steep.
 */
export const ELEVATION_UNITS_PER_METER = 64;

/**
 * How far below the lowest land elevation the out-of-map padding sits, in raw units.
 *
 * @remarks
 * Tiles overlap the map edge, so the area outside the world extent has to be filled with
 * *something* — and whatever that is, `color-relief` will paint it. Filling with the
 * lowest land elevation made the terrain colour bleed past the map and over the app
 * background at low zoom.
 *
 * The fix is a sentinel the ramp can key a fully transparent stop on. One raw unit
 * (1.56 cm) is enough to be distinguishable while leaving no cliff for the hillshade to
 * catch: no real cell ever falls between this value and `elevMin`, because water cells
 * are clamped to `elevMin` and land starts there by definition.
 */
export const DEM_PAD_OFFSET = 1;

/**
 * Lowest elevation the hypsometric ramp is allowed to start at, in raw units.
 *
 * @remarks
 * The sentinel lives one unit *below* the ramp floor, so the floor has to leave room for
 * it inside the encodable range — raw values are unsigned, and `packElevation` clamps at
 * zero. A city whose `elevMin` is 0 therefore packs its padding as elevation 0, which is
 * the ramp's `terrain.low` stop rather than the transparent sentinel, and the terrain
 * colour floods the whole viewport outside the map extent.
 *
 * That is not hypothetical: `san-rico`, `springvalley` and `atlantic-keys` all report
 * `elevMin = 0`, produced by a few dozen degenerate cells (both `elev` and `res` zero —
 * no data rather than land at absolute zero) among half a million. Every fixture in the
 * repo happens to have `elevMin > 0`, which is why the sentinel worked there and this
 * went unnoticed.
 *
 * Lifting the floor to 1 raw unit (1.56 cm) costs nothing visually and makes the sentinel
 * representable for any city.
 */
export const DEM_RAMP_FLOOR = DEM_PAD_OFFSET;

/**
 * The ramp's `terrain.low` anchor for a city, in raw units.
 *
 * @remarks
 * Single source of truth for the floor: `registerDemProtocol` derives the padding colour
 * from it and `buildColorReliefRamp` derives the transparent stop from it. The bug this
 * guards against is precisely the two sides disagreeing — the ramp asked for a stop at
 * `elevMin - 1` while the padding could only encode `max(0, elevMin - 1)`.
 */
export function demRampFloor(elevMin: number): number {
  return Math.max(elevMin, DEM_RAMP_FLOOR);
}

/** The out-of-map sentinel elevation for a city, in raw units. Always encodable. */
export function demPadElevation(elevMin: number): number {
  return demRampFloor(elevMin) - DEM_PAD_OFFSET;
}

/** The decoded DEM plus the pixel value to pad tiles with, or `null` when unregistered. */
interface DemState {
  bitmap: ImageBitmap;
  padColor: string;
}

let state: DemState | null = null;
let registered = false;

/**
 * Decodes `dem` and starts serving it under the `vellum-dem://` protocol.
 *
 * @remarks
 * Idempotent and safe to call on every city load: the protocol is registered with
 * MapLibre only once (a second `addProtocol` for the same scheme throws), while the
 * decoded bitmap is swapped so subsequent tile requests serve the new city.
 *
 * @param dem - The `CityData.terrainDem` payload produced by the Rust parser.
 */
export async function registerDemProtocol(dem: TerrainDem): Promise<void> {
  const bitmap = await decodeDataUri(dem.dataUri);
  state?.bitmap.close();
  state = { bitmap, padColor: packElevation(demPadElevation(dem.elevMin)) };

  if (!registered) {
    maplibregl.addProtocol(DEM_PROTOCOL, serveTile);
    registered = true;
  }
}

/** Stops serving DEM tiles and releases the decoded bitmap. */
export function unregisterDemProtocol(): void {
  if (registered) {
    maplibregl.removeProtocol(DEM_PROTOCOL);
    registered = false;
  }
  state?.bitmap.close();
  state = null;
}

/**
 * Serves one `vellum-dem://{z}/{x}/{y}` request as PNG bytes.
 *
 * Tiles that miss the map extent entirely are returned as a flat sea-floor fill rather
 * than an error, so MapLibre never retries them.
 */
async function serveTile(
  params: maplibregl.RequestParameters,
): Promise<{ data: ArrayBuffer }> {
  const tile = parseTileUrl(params.url);
  return { data: await renderDemTile(tile) };
}

/**
 * Renders one DEM tile as PNG bytes.
 *
 * @remarks
 * Split out from {@link serveTile} so the slicing can be exercised without a live
 * MapLibre map — the placement maths is the part most likely to be subtly wrong, and a
 * headless browser cannot drive MapLibre's render loop to surface it.
 *
 * Tiles that miss the map extent are filled with the lowest land elevation rather than
 * erroring, so the hillshade sees no cliff at the map border and MapLibre never retries.
 *
 * @param tile - The requested tile address.
 * @returns PNG-encoded RGBA bytes, `DEM_TILE_SIZE` square.
 */
export async function renderDemTile(tile: TileAddress): Promise<ArrayBuffer> {
  const current = state;
  if (!current) {
    throw new Error('DEM protocol queried before registerDemProtocol()');
  }

  const canvas = new OffscreenCanvas(DEM_TILE_SIZE, DEM_TILE_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('OffscreenCanvas 2D context unavailable');
  }

  ctx.fillStyle = current.padColor;
  ctx.fillRect(0, 0, DEM_TILE_SIZE, DEM_TILE_SIZE);
  ctx.imageSmoothingEnabled = false;

  const rect = demRectInTile(tile);
  ctx.drawImage(current.bitmap, rect.x, rect.y, rect.width, rect.height);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blob.arrayBuffer();
}

/** A Web Mercator tile address. */
export interface TileAddress {
  z: number;
  x: number;
  y: number;
}

/** Extracts `{z, x, y}` from a `vellum-dem://z/x/y` URL. */
function parseTileUrl(url: string): TileAddress {
  const parts = url.replace(`${DEM_PROTOCOL}://`, '').split('/');
  const [z, x, y] = parts.map(Number);
  if (z === undefined || x === undefined || y === undefined) {
    throw new Error(`Malformed DEM tile URL: ${url}`);
  }
  return { z, x, y };
}

/** Destination rectangle, in tile pixels, where the whole DEM image must be drawn. */
function demRectInTile(tile: TileAddress): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const h = CS1_HALF_EXTENT_DEG;
  const count = 2 ** tile.z;

  const lngWest = (tile.x / count) * 360 - 180;
  const lngEast = ((tile.x + 1) / count) * 360 - 180;
  const latNorth = mercatorYToLat(tile.y / count);
  const latSouth = mercatorYToLat((tile.y + 1) / count);

  const toPx = (lng: number): number =>
    ((lng - lngWest) / (lngEast - lngWest)) * DEM_TILE_SIZE;
  const toPy = (lat: number): number =>
    ((latNorth - lat) / (latNorth - latSouth)) * DEM_TILE_SIZE;

  return {
    x: toPx(-h),
    y: toPy(h),
    width: toPx(h) - toPx(-h),
    height: toPy(-h) - toPy(h),
  };
}

/** Converts a normalised Web Mercator Y (0 = north pole edge, 1 = south) to latitude. */
function mercatorYToLat(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

/** Renders a raw elevation as the `#rrggbb` this DEM's packing would produce. */
function packElevation(rawUnits: number): string {
  const raw = Math.max(0, Math.min(MAX_PACKED_ELEVATION, Math.round(rawUnits)));
  const hex = ((raw >> 8) * 256 * 256 + (raw & 0xff) * 256).toString(16);
  return `#${hex.padStart(6, '0')}`;
}

/** Decodes a `data:image/png;base64,…` URI into an `ImageBitmap`. */
async function decodeDataUri(dataUri: string): Promise<ImageBitmap> {
  const response = await fetch(dataUri);
  return createImageBitmap(await response.blob());
}
